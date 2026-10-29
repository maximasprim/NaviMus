import { and, desc, eq, schema, sql, withTenant, scopedInsert, type Database } from "@travel/database";

/**
 * Section 32 (invoicing). Invoice numbers are deterministic
 * (`INV-{year}-{first 8 chars of the booking id, uppercased}`) rather
 * than a sequential counter - a naive `count(*) + 1` scheme has a
 * race condition under concurrent payments (two webhooks landing at
 * the same instant could compute the same "next" number), and a real
 * gapless sequence needs its own locking primitive that doesn't exist
 * elsewhere in this schema yet. Deterministic-from-booking-id avoids
 * the race entirely and is still unique, traceable, and stable across
 * repeated calls for the same booking (needed since findOrCreateForBookingTx
 * is called on every successful payment, including partial payments).
 */
export class InvoiceRepository {
  constructor(private readonly db: Database) {}

  private buildInvoiceNumber(bookingId: string): string {
    const year = new Date().getFullYear();
    return `INV-${year}-${bookingId.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
  }

  /**
   * Called from inside the payment webhook's transaction on every
   * successful charge (including partial payments) - creates the
   * invoice on the first payment, and updates totals on subsequent
   * ones, so `amountPaid`/`balanceDue` always reflect the booking's
   * current payment state without a second reconciliation pass.
   */
  async upsertForBookingTx(
    tx: Database,
    tenantId: string,
    input: { bookingId: string; totalAmount: number; amountPaid: number; currency: string }
  ) {
    const [existing] = await tx
      .select()
      .from(schema.invoices)
      .where(withTenant(schema.invoices.tenantId, tenantId, eq(schema.invoices.bookingId, input.bookingId)))
      .limit(1);
    const balanceDue = Math.max(0, input.totalAmount - input.amountPaid);

    if (existing) {
      await tx
        .update(schema.invoices)
        .set({
          totalAmount: input.totalAmount.toFixed(2),
          amountPaid: input.amountPaid.toFixed(2),
          balanceDue: balanceDue.toFixed(2),
          updatedAt: new Date(),
        })
        .where(eq(schema.invoices.id, existing.id));
      return existing.id;
    }

    const [created] = await tx
      .insert(schema.invoices)
      .values(
        scopedInsert(tenantId, {
          bookingId: input.bookingId,
          invoiceNumber: this.buildInvoiceNumber(input.bookingId),
          totalAmount: input.totalAmount.toFixed(2),
          amountPaid: input.amountPaid.toFixed(2),
          balanceDue: balanceDue.toFixed(2),
          currency: input.currency,
        })
      )
      .returning({ id: schema.invoices.id });
    return created!.id;
  }

  /** Scoped to the caller's own bookings - an invoice id alone is never sufficient to read it. */
  async listForUser(tenantId: string, userId: string, page: number, pageSize: number) {
    const offset = (page - 1) * pageSize;
    const conditions = and(eq(schema.invoices.tenantId, tenantId), eq(schema.bookings.userId, userId));
    const [items, countRows] = await Promise.all([
      this.db
        .select({ invoice: schema.invoices, booking: schema.bookings })
        .from(schema.invoices)
        .innerJoin(schema.bookings, eq(schema.invoices.bookingId, schema.bookings.id))
        .where(conditions)
        .orderBy(desc(schema.invoices.createdAt))
        .limit(pageSize)
        .offset(offset),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.invoices)
        .innerJoin(schema.bookings, eq(schema.invoices.bookingId, schema.bookings.id))
        .where(conditions),
    ]);
    return { items: items.map((r) => ({ ...r.invoice, travelDate: r.booking.travelDate })), total: countRows[0]?.count ?? 0 };
  }

  async findByIdForUser(tenantId: string, id: string, userId: string) {
    const [row] = await this.db
      .select({ invoice: schema.invoices, booking: schema.bookings })
      .from(schema.invoices)
      .innerJoin(schema.bookings, eq(schema.invoices.bookingId, schema.bookings.id))
      .where(withTenant(schema.invoices.tenantId, tenantId, eq(schema.invoices.id, id), eq(schema.bookings.userId, userId)))
      .limit(1);
    return row ?? null;
  }
}
