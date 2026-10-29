import { and, desc, eq, gte, lte, schema, sql, withTenant, withPlatformRLSBypass, scopedInsert, type Database } from "@travel/database";
import type { LedgerEntryType, PaymentStatus } from "@travel/types";

export class PaymentRepository {
  constructor(private readonly db: Database) {}

  async findByIdempotencyKey(tenantId: string, key: string) {
    const [payment] = await this.db
      .select()
      .from(schema.payments)
      .where(withTenant(schema.payments.tenantId, tenantId, eq(schema.payments.idempotencyKey, key)))
      .limit(1);
    return payment ?? null;
  }

  async findById(tenantId: string, id: string) {
    const [payment] = await this.db
      .select()
      .from(schema.payments)
      .where(withTenant(schema.payments.tenantId, tenantId, eq(schema.payments.id, id)))
      .limit(1);
    return payment ?? null;
  }

  /** Admin-facing: lets the refunds UI resolve a bookingId to the paymentId(s) refundRequestSchema actually needs. */
  async findByBookingId(tenantId: string, bookingId: string) {
    return this.db
      .select()
      .from(schema.payments)
      .where(withTenant(schema.payments.tenantId, tenantId, eq(schema.payments.bookingId, bookingId)))
      .orderBy(desc(schema.payments.createdAt));
  }

  /**
   * Webhook entry point: the provider's callback carries no tenant, so this
   * is the one place a payment is looked up BEFORE its tenant is known - the
   * lookup is what tells us the tenant. It therefore runs under an explicit
   * RLS bypass, scoped to this single read-only query; everything after it
   * runs inside withTenantRLS(payment.tenantId). (Providers can't send an
   * X-Tenant-Id header, which is why webhook routes are mounted outside the
   * gateway's tenantContext middleware.)
   */
  async findByProviderReference(providerReference: string) {
    return withPlatformRLSBypass(this.db, async (tx) => {
      const [row] = await tx
        .select({ payment: schema.payments })
        .from(schema.paymentTransactions)
        .innerJoin(schema.payments, eq(schema.paymentTransactions.paymentId, schema.payments.id))
        .where(eq(schema.paymentTransactions.providerReference, providerReference))
        .limit(1);
      return row?.payment ?? null;
    });
  }

  async create(tenantId: string, input: {
    bookingId: string;
    provider: string;
    originalAmount: number;
    originalCurrency: string;
    baseCurrencyAmount: number;
    baseCurrency: string;
    idempotencyKey: string;
  }) {
    const [payment] = await this.db
      .insert(schema.payments)
      .values(
        scopedInsert(tenantId, {
          bookingId: input.bookingId,
          provider: input.provider,
          status: "INITIATED",
          originalAmount: input.originalAmount.toFixed(2),
          originalCurrency: input.originalCurrency,
          baseCurrencyAmount: input.baseCurrencyAmount.toFixed(2),
          baseCurrency: input.baseCurrency,
          idempotencyKey: input.idempotencyKey,
        })
      )
      .returning();
    return payment!;
  }

  async recordTransaction(paymentId: string, providerReference: string, rawPayload: unknown) {
    await this.db.insert(schema.paymentTransactions).values({ paymentId, providerReference, rawPayload });
  }

  /**
   * Records a webhook BEFORE it's acted on. The unique constraint
   * on (provider, eventId) gives replay protection, but a conflict only
   * counts as a duplicate if the earlier delivery was fully PROCESSED -
   * see the comment below.
   */
  async tryRecordWebhook(provider: string, eventId: string, signatureVerified: boolean, payload: unknown) {
    const [inserted] = await this.db
      .insert(schema.paymentWebhooks)
      .values({ provider, eventId, signatureVerified, payload: payload as any })
      .onConflictDoNothing()
      .returning();
    if (inserted) return { alreadyProcessed: false, row: inserted };

    // Seen before. Only treat it as a duplicate if it was actually
    // PROCESSED. The old code treated any insert failure as "already
    // processed", so if the first attempt crashed after recording the row
    // but before committing the payment, the provider's retry was dropped
    // and a paid customer never got confirmed.
    const [existing] = await this.db
      .select()
      .from(schema.paymentWebhooks)
      .where(and(eq(schema.paymentWebhooks.provider, provider), eq(schema.paymentWebhooks.eventId, eventId)))
      .limit(1);
    if (!existing) return { alreadyProcessed: true, row: null }; // vanished mid-race; safest to no-op
    return { alreadyProcessed: existing.processedAt !== null, row: existing.processedAt !== null ? null : existing };
  }

  /** Row-locks a payment for the rest of the transaction, so concurrent deliveries of the same callback serialize. */
  async lockByIdTx(tx: Database, paymentId: string) {
    const [row] = await tx.select().from(schema.payments).where(eq(schema.payments.id, paymentId)).for("update").limit(1);
    return row ?? null;
  }

  async setProviderReceiptTx(tx: Database, paymentId: string, receipt: string) {
    await tx.update(schema.payments).set({ providerReceipt: receipt }).where(eq(schema.payments.id, paymentId));
  }

  /**
   * Joins through to bookings to enforce tenant scoping - ledger_entries
   * has no tenant_id column of its own (append-only child of bookings,
   * per the Phase 1 schema decision). This is money data, so the join
   * check here matters even though bookingId is normally already
   * tenant-verified by the caller before reaching this method.
   */
  async getLedgerForBooking(tenantId: string, bookingId: string) {
    return this.db
      .select({ entry: schema.ledgerEntries })
      .from(schema.ledgerEntries)
      .innerJoin(schema.bookings, eq(schema.bookings.id, schema.ledgerEntries.bookingId))
      .where(and(eq(schema.ledgerEntries.bookingId, bookingId), eq(schema.bookings.tenantId, tenantId)))
      .then((rows) => rows.map((r) => r.entry));
  }

  /**
   * Operator self-service earnings summary: sums operator_earning
   * ledger entries for bookings whose package belongs to this
   * operator. Joined through packages -> bookings rather than a
   * denormalized operatorId column on ledger_entries, since the
   * ledger's job is to be an accurate append-only record of what
   * actually happened, not a pre-aggregated reporting table.
   */
  async getOperatorEarnings(tenantId: string, operatorId: string, range: { from?: string; to?: string } = {}) {
    const conditions = [
      eq(schema.packages.tenantId, tenantId),
      eq(schema.packages.operatorId, operatorId),
      eq(schema.ledgerEntries.entryType, "operator_earning"),
    ];
    if (range.from) conditions.push(gte(schema.ledgerEntries.createdAt, new Date(range.from)));
    if (range.to) conditions.push(lte(schema.ledgerEntries.createdAt, new Date(range.to)));

    const rows = await this.db
      .select({
        total: sql<string>`COALESCE(SUM(${schema.ledgerEntries.amount}), 0)`,
        currency: schema.ledgerEntries.currency,
      })
      .from(schema.ledgerEntries)
      .innerJoin(schema.bookings, eq(schema.ledgerEntries.bookingId, schema.bookings.id))
      .innerJoin(schema.packages, eq(schema.bookings.packageId, schema.packages.id))
      .where(and(...conditions))
      .groupBy(schema.ledgerEntries.currency);

    // Ledger amounts are stored negative for debits from the platform's
    // perspective (operator_earning reduces the platform's balance) - flip
    // sign here so the operator sees a positive amount they're owed.
    return rows.map((r) => ({ currency: r.currency, amount: Math.abs(Number(r.total)) }));
  }

  /** Section 28 (partner portal analytics) - daily earnings series for the operator's own packages, same date_trunc pattern as the admin dashboard's time series. */
  async getOperatorEarningsTimeSeries(tenantId: string, operatorId: string, range: { from?: string; to?: string } = {}) {
    const conditions = [
      eq(schema.packages.tenantId, tenantId),
      eq(schema.packages.operatorId, operatorId),
      eq(schema.ledgerEntries.entryType, "operator_earning"),
    ];
    if (range.from) conditions.push(gte(schema.ledgerEntries.createdAt, new Date(range.from)));
    if (range.to) conditions.push(lte(schema.ledgerEntries.createdAt, new Date(range.to)));

    const rows = await this.db
      .select({
        day: sql<string>`date_trunc('day', ${schema.ledgerEntries.createdAt})::date`,
        total: sql<string>`COALESCE(SUM(${schema.ledgerEntries.amount}), 0)`,
      })
      .from(schema.ledgerEntries)
      .innerJoin(schema.bookings, eq(schema.ledgerEntries.bookingId, schema.bookings.id))
      .innerJoin(schema.packages, eq(schema.bookings.packageId, schema.packages.id))
      .where(and(...conditions))
      .groupBy(sql`date_trunc('day', ${schema.ledgerEntries.createdAt})`)
      .orderBy(sql`date_trunc('day', ${schema.ledgerEntries.createdAt})`);

    return rows.map((r) => ({ date: r.day, amount: Math.abs(Number(r.total)) }));
  }

  /**
   * Everything below accepts an explicit `tx` so the caller can run
   * status updates, ledger postings, and (in the Booking service)
   * a status-machine transition in one atomic transaction.
   */

  async updateStatusTx(tx: Database, paymentId: string, status: PaymentStatus) {
    await tx.update(schema.payments).set({ status, updatedAt: new Date() }).where(eq(schema.payments.id, paymentId));
  }

  async markWebhookProcessedTx(tx: Database, webhookRowId: string) {
    await tx
      .update(schema.paymentWebhooks)
      .set({ processedAt: new Date() })
      .where(eq(schema.paymentWebhooks.id, webhookRowId));
  }

  async createRefundTx(
    tx: Database,
    input: { paymentId: string; amount: number; currency: string; reason?: string }
  ) {
    const [refund] = await tx
      .insert(schema.paymentRefunds)
      .values({
        paymentId: input.paymentId,
        amount: input.amount.toFixed(2),
        currency: input.currency,
        reason: input.reason,
        status: "REFUND_PENDING",
      })
      .returning();
    return refund!;
  }

  /**
   * Refund/payment lookups for provider callbacks (M-Pesa reversal result,
   * Stripe refund.updated), which carry no tenant. Same reasoning as
   * findByProviderReference: the lookup is what reveals the tenant, so it runs
   * under an explicit, read-only RLS bypass.
   */
  async findRefundById(refundId: string) {
    return withPlatformRLSBypass(this.db, async (tx) => {
      const [row] = await tx.select().from(schema.paymentRefunds).where(eq(schema.paymentRefunds.id, refundId)).limit(1);
      return row ?? null;
    });
  }

  async findRefundByProviderReference(providerReference: string) {
    return withPlatformRLSBypass(this.db, async (tx) => {
      const [row] = await tx.select().from(schema.paymentRefunds).where(eq(schema.paymentRefunds.providerReference, providerReference)).limit(1);
      return row ?? null;
    });
  }

  async findPaymentByIdUnscoped(paymentId: string) {
    return withPlatformRLSBypass(this.db, async (tx) => {
      const [row] = await tx.select().from(schema.payments).where(eq(schema.payments.id, paymentId)).limit(1);
      return row ?? null;
    });
  }

  async lockRefundTx(tx: Database, refundId: string) {
    const [row] = await tx.select().from(schema.paymentRefunds).where(eq(schema.paymentRefunds.id, refundId)).for("update").limit(1);
    return row ?? null;
  }

  async updateRefundStatusTx(tx: Database, refundId: string, status: PaymentStatus, providerReference?: string) {
    await tx
      .update(schema.paymentRefunds)
      .set({ status, providerReference, updatedAt: new Date() })
      .where(eq(schema.paymentRefunds.id, refundId));
  }

  /** Insert-only by design - see the schema comment on ledger_entries. No update method exists here on purpose. */
  async postLedgerEntryTx(
    tx: Database,
    input: {
      bookingId: string;
      paymentId?: string;
      entryType: LedgerEntryType;
      amount: number; // signed: positive = credit, negative = debit
      currency: string;
      description?: string;
    }
  ) {
    await tx.insert(schema.ledgerEntries).values({
      bookingId: input.bookingId,
      paymentId: input.paymentId,
      entryType: input.entryType,
      amount: input.amount.toFixed(2),
      currency: input.currency,
      description: input.description,
    });
  }
}
