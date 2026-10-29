import { randomUUID } from "node:crypto";
import { and, eq, schema, withPlatformRLSBypass, withTenantRLS, type Database } from "@travel/database";
import { BookingError, ConflictError, NotFoundError, PaymentError, ValidationError } from "@travel/types";
import { transitionBookingStatus } from "@travel/service-bookings/internal";
import { EventPublisher } from "@travel/events";
import type { CreatePaymentIntentInput, RefundRequestInput } from "@travel/validation";
import { createServiceLogger } from "@travel/logger";
import { getPaymentProvider } from "../providers/index.js";
import { MpesaProvider, type ReversalCallbackKind } from "../providers/mpesa-provider.js";
import type { WebhookContext } from "../providers/payment-provider.js";
import { evaluateWebhook, involvesPossibleRealMoney } from "../webhook-decision.js";
import type { PaymentRepository } from "../repositories/payment-repository.js";
import type { SettingsRepository } from "../repositories/settings-repository.js";
import type { InvoiceRepository } from "../repositories/invoice-repository.js";

const logger = createServiceLogger("payment-service");

export class PaymentService {
  constructor(
    private readonly db: Database,
    private readonly payments: PaymentRepository,
    private readonly settings: SettingsRepository,
    private readonly events: EventPublisher,
    private readonly invoices: InvoiceRepository
  ) {}

  /**
   * Initiates a payment for a booking. Idempotent per booking:
   * calling this twice for the same booking while a payment is
   * already in flight returns the existing one rather than double-
   * charging the customer.
   */
  async createIntent(tenantId: string, input: CreatePaymentIntentInput, idempotencyKey: string) {
    const existing = await this.payments.findByIdempotencyKey(tenantId, idempotencyKey);
    if (existing) return existing;

    // Tenant filter here is what stops an authenticated user from creating
    // a payment intent against a bookingId belonging to a different tenant.
    const [booking] = await this.db
      .select()
      .from(schema.bookings)
      .where(and(eq(schema.bookings.id, input.bookingId), eq(schema.bookings.tenantId, tenantId)))
      .limit(1);
    if (!booking) throw new NotFoundError("Booking");
    if (booking.status !== "PENDING_PAYMENT") {
      throw new ConflictError(`Booking is in status ${booking.status} and cannot accept a new payment`);
    }
    if (input.provider === "mpesa" && !input.phoneNumber) {
      throw new ValidationError("phoneNumber is required for M-Pesa payments");
    }

    const provider = getPaymentProvider(input.provider);
    if (provider.supportedCurrencies && !provider.supportedCurrencies.includes(booking.currency)) {
      // e.g. M-Pesa only collects KES. Previously a USD 500 booking would
      // have sent "500" to Daraja and charged the customer KES 500.
      throw new ValidationError(
        `${input.provider} can only be used for ${provider.supportedCurrencies.join("/")} bookings; this booking is in ${booking.currency}. Choose a different payment method.`
      );
    }
    const amountDue = Number(booking.totalAmount) - Number(booking.amountPaid);
    if (amountDue <= 0) {
      throw new ConflictError("This booking has already been paid in full");
    }

    const payment = await this.payments.create(tenantId, {
      bookingId: booking.id,
      provider: input.provider,
      originalAmount: amountDue,
      originalCurrency: booking.currency,
      baseCurrencyAmount: amountDue, // exchange-rate conversion is a no-op until multi-currency FX is wired in
      baseCurrency: booking.currency,
      idempotencyKey,
    });

    const intent = await provider.createIntent({
      paymentId: payment.id,
      bookingId: booking.id,
      amount: amountDue,
      currency: booking.currency,
      phoneNumber: input.phoneNumber,
      description: `Booking ${booking.id.slice(0, 8)} - ${booking.currency} ${amountDue.toFixed(2)}`,
    });

    await this.payments.recordTransaction(payment.id, intent.providerReference, intent.raw);

    await withTenantRLS(this.db, tenantId, async (tx) => {
      await this.payments.updateStatusTx(tx, payment.id, "PENDING");
      await transitionBookingStatus(tx, booking.id, "PAYMENT_PROCESSING", {
        reason: `Payment initiated via ${input.provider}`,
      });
    });

    await this.events.publish("payment.initiated", {
      tenantId,
      paymentId: payment.id,
      bookingId: booking.id,
      provider: input.provider,
      amount: amountDue.toFixed(2),
      currency: booking.currency,
    });

    return { ...payment, status: "PENDING" as const, providerReference: intent.providerReference };
  }

  /**
   * Processes an inbound webhook. This is the ONLY path that can
   * move a booking from PAYMENT_PROCESSING to CONFIRMED - client-
   * reported success is never trusted (rule #9 in the brief).
   *
   * Layers, in order:
   *  1. provider.verifyWebhook authenticates the event (Stripe HMAC;
   *     M-Pesa signed callback URL + Daraja query). Nothing is written
   *     before this passes.
   *  2. (provider, eventId) dedup - but only for events that were fully
   *     PROCESSED, so a crash mid-processing is retried, not swallowed.
   *  3. evaluateWebhook checks the genuine event against what we asked
   *     the customer to pay (amount, currency, payment binding, state).
   *  4. The payment and booking rows are locked FOR UPDATE for the
   *     transaction, so two concurrent deliveries - or two partial
   *     payments on one booking - can't double-credit or lose an update.
   */
  async handleWebhook(
    providerName: "mpesa" | "stripe" | "mock",
    rawBody: string,
    headers: Record<string, string | undefined>,
    ctx: WebhookContext = {}
  ) {
    const provider = getPaymentProvider(providerName);
    const event = await provider.verifyWebhook(rawBody, headers, ctx);

    const { alreadyProcessed, row } = await this.payments.tryRecordWebhook(providerName, event.eventId, true, event.raw);
    if (alreadyProcessed || !row) {
      return { deduplicated: true };
    }

    // Authentic but irrelevant events (and Stripe event types we don't act on)
    // are recorded as processed and stop here - they must not be looked up as
    // payments, and must not sit "unprocessed" forever.
    if (event.outcome === "IGNORED") {
      await withPlatformRLSBypass(this.db, (tx) => this.payments.markWebhookProcessedTx(tx, row.id));
      return { deduplicated: false, matched: false, ignored: "event_type_ignored" };
    }

    // Refund lifecycle events settle a PENDING refund (Stripe refund.updated).
    if (event.outcome === "REFUND_SUCCEEDED" || event.outcome === "REFUND_FAILED") {
      const refund = await this.payments.findRefundByProviderReference(event.providerReference);
      // Left unprocessed on purpose if unknown: it may have raced ahead of us
      // storing the provider reference, and Stripe's retry will then match.
      if (!refund) return { deduplicated: false, matched: false };
      const settled = await this.settleRefund(refund.id, {
        kind: event.outcome === "REFUND_SUCCEEDED" ? "SUCCEEDED" : "FAILED",
        amount: event.amount,
        amountTolerance: provider.amountTolerance,
      });
      await withPlatformRLSBypass(this.db, (tx) => this.payments.markWebhookProcessedTx(tx, row.id));
      return { deduplicated: false, matched: true, ...settled };
    }

    const payment = await this.payments.findByProviderReference(event.providerReference);
    if (!payment) {
      // Left unprocessed on purpose: if this callback simply raced ahead of
      // recordTransaction (possible with Stripe), a retry will now match.
      return { deduplicated: false, matched: false };
    }
    // The webhook itself carries no tenant context (see findByProviderReference's
    // doc comment) - payment.tenantId, resolved from that lookup, is the tenant
    // for the rest of this flow.
    const tenantId = payment.tenantId;

    type TxResult =
      | { kind: "applied"; booking: typeof schema.bookings.$inferSelect; isFullyPaid: boolean; newAmountPaid: number }
      | { kind: "skipped"; action: "ignore" | "reject"; reason: string };

    const result: TxResult = await withTenantRLS(this.db, tenantId, async (tx): Promise<TxResult> => {
      const lockedPayment = await this.payments.lockByIdTx(tx, payment.id);
      if (!lockedPayment) throw new NotFoundError("Payment");
      const [booking] = await tx
        .select()
        .from(schema.bookings)
        .where(and(eq(schema.bookings.id, lockedPayment.bookingId), eq(schema.bookings.tenantId, tenantId)))
        .for("update")
        .limit(1);
      if (!booking) throw new NotFoundError("Booking");

      const decision = evaluateWebhook({
        event,
        payment: lockedPayment,
        bookingStatus: booking.status,
        amountTolerance: provider.amountTolerance,
      });

      if (decision.action !== "apply") {
        await this.payments.markWebhookProcessedTx(tx, row.id);
        return { kind: "skipped", action: decision.action, reason: decision.reason };
      }

      let isFullyPaid = false;
      let newAmountPaid = Number(booking.amountPaid);

      if (event.outcome === "PAID") {
        await this.payments.updateStatusTx(tx, payment.id, "PAID");
        if (event.providerReceipt) await this.payments.setProviderReceiptTx(tx, payment.id, event.providerReceipt);

        newAmountPaid = Number(booking.amountPaid) + event.amount;
        isFullyPaid = newAmountPaid >= Number(booking.totalAmount) - 0.01; // tolerate rounding
        await tx
          .update(schema.bookings)
          .set({ amountPaid: newAmountPaid.toFixed(2), updatedAt: new Date() })
          .where(eq(schema.bookings.id, booking.id));

        await transitionBookingStatus(tx, booking.id, isFullyPaid ? "CONFIRMED" : "PARTIALLY_PAID", {
          reason: `Payment received via ${providerName}`,
        });

        await this.postSettlementLedgerTx(tx, booking, payment.id, event.amount);
        // Section 32: keep the invoice in sync with every successful
        // charge, not just the final one - a customer who's made a
        // deposit should already see a balance-due invoice, not just
        // one that appears once the trip is fully paid.
        await this.invoices.upsertForBookingTx(tx, tenantId, {
          bookingId: booking.id,
          totalAmount: Number(booking.totalAmount),
          amountPaid: newAmountPaid,
          currency: booking.currency,
        });
      } else {
        await this.payments.updateStatusTx(tx, payment.id, event.outcome === "CANCELLED" ? "CANCELLED" : "FAILED");
        // evaluateWebhook only guarantees PAYMENT_PROCESSING for PAID events.
        if (booking.status === "PAYMENT_PROCESSING") {
          await transitionBookingStatus(tx, booking.id, "FAILED", { reason: `Payment ${event.outcome.toLowerCase()}` });
        }
      }

      await this.payments.markWebhookProcessedTx(tx, row.id);
      return { kind: "applied", booking, isFullyPaid, newAmountPaid };
    });

    if (result.kind === "skipped") {
      const level = result.action === "reject" && involvesPossibleRealMoney(result.reason as any) ? "error" : "warn";
      logger[level](
        { paymentId: payment.id, provider: providerName, eventId: event.eventId, reason: result.reason, outcome: event.outcome, amount: event.amount, currency: event.currency },
        result.action === "reject"
          ? "Webhook REJECTED - payment not applied; needs manual review if money moved"
          : "Webhook ignored"
      );
      return { deduplicated: false, matched: true, applied: false, [result.action === "reject" ? "rejected" : "ignored"]: result.reason };
    }

    const { booking, isFullyPaid } = result;
    if (event.outcome === "PAID") {
      await this.events.publish("payment.completed", {
        tenantId,
        paymentId: payment.id,
        bookingId: booking.id,
        contactEmail: booking.contactEmail,
        contactPhone: booking.contactPhone,
        amount: event.amount.toFixed(2),
        currency: event.currency,
      });

      // Only on full payment - a deposit shouldn't trigger "your trip is
      // confirmed" messaging or start the reminder countdown.
      if (isFullyPaid) {
        await this.events.publish("booking.confirmed", {
          tenantId,
          bookingId: booking.id,
          userId: booking.userId,
          contactEmail: booking.contactEmail,
          contactPhone: booking.contactPhone,
          travelDate: booking.travelDate,
        });
      }
    } else {
      await this.events.publish("payment.failed", {
        tenantId,
        paymentId: payment.id,
        bookingId: booking.id,
        contactEmail: booking.contactEmail,
        reason: event.outcome,
      });
    }

    return { deduplicated: false, matched: true, applied: true, outcome: event.outcome };
  }

  /**
   * Splits a successful customer payment into the immutable ledger
   * entries described in the brief: customer_payment (credit),
   * platform_fee (the platform's cut), operator_earning (the rest).
   * All three are posted atomically with the status transition.
   */
  private async postSettlementLedgerTx(tx: Database, booking: typeof schema.bookings.$inferSelect, paymentId: string, amount: number) {
    let commissionPercent = await this.settings.getPlatformCommissionPercent(booking.tenantId);

    if (booking.packageId) {
      const [pkgRow] = await tx
        .select({ commissionRatePercent: schema.operators.commissionRatePercent })
        .from(schema.packages)
        .innerJoin(schema.operators, eq(schema.packages.operatorId, schema.operators.id))
        .where(eq(schema.packages.id, booking.packageId))
        .limit(1);
      if (pkgRow?.commissionRatePercent) {
        const override = Number(pkgRow.commissionRatePercent);
        if (Number.isFinite(override)) commissionPercent = override;
      }
    }

    const platformFee = Math.round(amount * (commissionPercent / 100) * 100) / 100;
    const operatorEarning = Math.round((amount - platformFee) * 100) / 100;

    await this.payments.postLedgerEntryTx(tx, {
      bookingId: booking.id,
      paymentId,
      entryType: "customer_payment",
      amount,
      currency: booking.currency,
      description: "Customer payment received",
    });
    await this.payments.postLedgerEntryTx(tx, {
      bookingId: booking.id,
      paymentId,
      entryType: "platform_fee",
      amount: -platformFee,
      currency: booking.currency,
      description: `Platform commission (${commissionPercent}%)`,
    });
    await this.payments.postLedgerEntryTx(tx, {
      bookingId: booking.id,
      paymentId,
      entryType: "operator_earning",
      amount: -operatorEarning,
      currency: booking.currency,
      description: "Operator earning",
    });
  }

  /**
   * Issues a refund for a booking cancellation (or manual admin
   * action). Ledger entries are posted only after the provider
   * confirms the refund - never before money has actually moved.
   */
  /**
   * Refunds a payment. A state machine, not a single call:
   *
   *   PAID --(claim, row-locked)--> REFUND_PENDING --(provider says done)--> REFUNDED | PARTIALLY_REFUNDED
   *                                      |
   *                                      +--(provider rejects / errors)--> back to PAID, refund row FAILED
   *                                      +--(provider is async: M-Pesa, slow Stripe)--> stays pending until
   *                                         the signed callback / refund.updated event settles it
   *
   * Money is only recorded as returned (payment status, ledger entry, the
   * "refund completed" event) once the provider has actually confirmed it.
   * The old version did all three even when the provider only said
   * "REFUND_PENDING", and had no lock, so two simultaneous requests could
   * both pass the PAID check and refund the customer twice.
   */
  async refund(tenantId: string, input: RefundRequestInput) {
    const payment = await this.payments.findById(tenantId, input.paymentId);
    if (!payment) throw new NotFoundError("Payment");

    const amount = input.amount ?? Number(payment.originalAmount);
    if (!(amount > 0)) throw new ValidationError("Refund amount must be greater than zero");
    if (amount > Number(payment.originalAmount)) {
      throw new ValidationError("Refund amount cannot exceed the original payment amount");
    }

    const provider = getPaymentProvider(payment.provider);
    const [transactionRow] = await this.db
      .select()
      .from(schema.paymentTransactions)
      .where(eq(schema.paymentTransactions.paymentId, payment.id))
      .limit(1);
    if (!transactionRow) throw new NotFoundError("Payment transaction record");

    // 1. Claim: under a row lock, require PAID and move to REFUND_PENDING in
    //    the same transaction. A concurrent refund blocks here, then sees
    //    REFUND_PENDING and is refused.
    const { refund, original } = await withTenantRLS(this.db, tenantId, async (tx) => {
      const locked = await this.payments.lockByIdTx(tx, payment.id);
      if (!locked) throw new NotFoundError("Payment");
      if (locked.status !== "PAID") {
        throw new ConflictError(`Cannot refund a payment in status ${locked.status}`);
      }
      await this.payments.updateStatusTx(tx, payment.id, "REFUND_PENDING");
      const created = await this.payments.createRefundTx(tx, {
        paymentId: payment.id,
        amount,
        currency: payment.originalCurrency,
        reason: input.reason,
      });
      return { refund: created, original: locked };
    });

    // 2. Ask the provider. If it throws, undo the claim - otherwise the
    //    payment would be stuck REFUND_PENDING and the refund row dangling.
    let providerResult;
    try {
      providerResult = await provider.refund({
        providerReference: transactionRow.providerReference,
        amount,
        currency: payment.originalCurrency,
        reason: input.reason,
        refundId: refund.id,
        providerReceipt: original.providerReceipt,
        originalAmount: Number(payment.originalAmount),
      });
    } catch (err) {
      await withTenantRLS(this.db, tenantId, async (tx) => {
        await this.payments.updateRefundStatusTx(tx, refund.id, "FAILED");
        await this.payments.updateStatusTx(tx, payment.id, "PAID");
      });
      throw err;
    }

    // 3. Settle now if the provider already completed it; otherwise record the
    //    provider's reference and wait for the callback.
    if (providerResult.status === "REFUNDED") {
      await this.settleRefund(refund.id, { kind: "SUCCEEDED", providerReference: providerResult.providerReference });
      return { refundId: refund.id, status: "REFUNDED" as const, amount };
    }
    await withTenantRLS(this.db, tenantId, (tx) =>
      this.payments.updateRefundStatusTx(tx, refund.id, "REFUND_PENDING", providerResult.providerReference)
    );
    return { refundId: refund.id, status: "REFUND_PENDING" as const, amount };
  }

  /**
   * Applies a refund's final outcome. Called by the synchronous path, the
   * Stripe refund.updated event and the M-Pesa reversal callback. Idempotent
   * by state: only a refund that is still REFUND_PENDING can be settled, under
   * a row lock, so duplicate or racing callbacks apply at most once.
   */
  async settleRefund(
    refundId: string,
    result: { kind: "SUCCEEDED" | "FAILED"; amount?: number; amountTolerance?: number; providerReference?: string }
  ): Promise<{ settled: boolean; refundStatus?: string; skipped?: string }> {
    const refundRow = await this.payments.findRefundById(refundId);
    if (!refundRow) return { settled: false, skipped: "unknown_refund" };
    const payment = await this.payments.findPaymentByIdUnscoped(refundRow.paymentId);
    if (!payment) return { settled: false, skipped: "unknown_payment" };
    const tenantId = payment.tenantId;

    const outcome = await withTenantRLS(this.db, tenantId, async (tx) => {
      const refund = await this.payments.lockRefundTx(tx, refundId);
      const lockedPayment = await this.payments.lockByIdTx(tx, payment.id);
      if (!refund || !lockedPayment) return { settled: false as const, skipped: "vanished" };
      if (refund.status !== "REFUND_PENDING") return { settled: false as const, skipped: "already_settled" };

      if (result.kind === "FAILED") {
        // The money did NOT go back to the customer: the payment is whole again.
        await this.payments.updateRefundStatusTx(tx, refund.id, "FAILED", result.providerReference ?? refund.providerReference ?? undefined);
        if (lockedPayment.status === "REFUND_PENDING") await this.payments.updateStatusTx(tx, payment.id, "PAID");
        return { settled: true as const, refundStatus: "FAILED" };
      }

      const refundAmount = Number(refund.amount);
      if (result.amount !== undefined && Math.abs(result.amount - refundAmount) > (result.amountTolerance ?? 0.01)) {
        // Provider says it returned a different amount than we asked for.
        // Don't record a ledger entry we can't stand behind; leave it for a human.
        logger.error({ refundId, expected: refundAmount, reported: result.amount }, "Refund result amount does not match - left REFUND_PENDING for manual review");
        return { settled: false as const, skipped: "amount_mismatch" };
      }

      await this.payments.updateRefundStatusTx(tx, refund.id, "REFUNDED", result.providerReference ?? refund.providerReference ?? undefined);
      const isFull = refundAmount >= Number(lockedPayment.originalAmount) - 0.01;
      await this.payments.updateStatusTx(tx, payment.id, isFull ? "REFUNDED" : "PARTIALLY_REFUNDED");
      await this.payments.postLedgerEntryTx(tx, {
        bookingId: payment.bookingId,
        paymentId: payment.id,
        entryType: "refund",
        amount: -refundAmount,
        currency: refund.currency,
        description: refund.reason ?? "Refund issued",
      });
      return { settled: true as const, refundStatus: "REFUNDED", amount: refundAmount, currency: refund.currency };
    });

    if (outcome.settled && outcome.refundStatus === "REFUNDED") {
      const [bookingRow] = await this.db
        .select({ contactEmail: schema.bookings.contactEmail })
        .from(schema.bookings)
        .where(eq(schema.bookings.id, payment.bookingId))
        .limit(1);
      await this.events.publish("refund.completed", {
        tenantId,
        bookingId: payment.bookingId,
        contactEmail: bookingRow?.contactEmail ?? "",
        amount: outcome.amount!.toFixed(2),
        currency: outcome.currency!,
      });
    }
    return outcome.settled ? { settled: true, refundStatus: outcome.refundStatus } : { settled: false, skipped: outcome.skipped };
  }

  /**
   * M-Pesa reversal (refund) result / timeout callback. Authenticated by the
   * signed callback URL (see MpesaProvider.verifyReversalCallback). A TIMEOUT
   * is NOT a failure: Safaricom didn't answer, so the money may or may not
   * have moved. The refund stays REFUND_PENDING and is logged for a human to
   * check in the Safaricom portal - marking it failed could re-refund later,
   * marking it succeeded could record money that never moved.
   */
  async handleReversalCallback(
    rawBody: string,
    ctx: { refundId?: string; signature?: string; clientIp?: string; kind: ReversalCallbackKind }
  ) {
    const provider = getPaymentProvider("mpesa");
    if (!(provider instanceof MpesaProvider)) throw new ValidationError("M-Pesa provider is unavailable");
    const cb = provider.verifyReversalCallback(rawBody, ctx);

    const refund = await this.payments.findRefundById(cb.refundId);
    if (!refund) return { matched: false };

    if (cb.originatorConversationId && refund.providerReference && cb.originatorConversationId !== refund.providerReference) {
      logger.error({ refundId: refund.id, got: cb.originatorConversationId, expected: refund.providerReference }, "M-Pesa reversal callback conversation id mismatch - ignored");
      return { matched: true, rejected: "conversation_mismatch" };
    }
    if (cb.outcome === "TIMEOUT") {
      logger.error({ refundId: refund.id, description: cb.description }, "M-Pesa reversal TIMED OUT - refund left REFUND_PENDING; verify in the Safaricom portal before retrying");
      return { matched: true, outcome: "timeout_needs_review" };
    }
    const settled = await this.settleRefund(refund.id, {
      kind: cb.outcome === "SUCCEEDED" ? "SUCCEEDED" : "FAILED",
      amount: cb.amount,
      amountTolerance: provider.amountTolerance,
    });
    if (cb.outcome === "FAILED") logger.error({ refundId: refund.id, description: cb.description }, "M-Pesa reversal FAILED - payment restored to PAID");
    return { matched: true, ...settled };
  }

  async getLedger(tenantId: string, bookingId: string) {
    return this.payments.getLedgerForBooking(tenantId, bookingId);
  }

  async listPaymentsForBooking(tenantId: string, bookingId: string) {
    return this.payments.findByBookingId(tenantId, bookingId);
  }

  async listMyInvoices(tenantId: string, userId: string, page: number, pageSize: number) {
    return this.invoices.listForUser(tenantId, userId, page, pageSize);
  }

  async getMyInvoice(tenantId: string, id: string, userId: string) {
    const row = await this.invoices.findByIdForUser(tenantId, id, userId);
    if (!row) throw new NotFoundError("Invoice");
    return row;
  }

  async getOperatorEarnings(tenantId: string, operatorId: string, range: { from?: string; to?: string } = {}) {
    return this.payments.getOperatorEarnings(tenantId, operatorId, range);
  }

  async getOperatorEarningsTimeSeries(tenantId: string, operatorId: string, range: { from?: string; to?: string } = {}) {
    return this.payments.getOperatorEarningsTimeSeries(tenantId, operatorId, range);
  }
}
