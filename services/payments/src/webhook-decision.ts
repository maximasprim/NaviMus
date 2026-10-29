import type { VerifiedWebhookEvent } from "./providers/payment-provider.js";

/**
 * The single place that decides what a (already authenticated) provider
 * event is allowed to do to a payment/booking. Pure on purpose: every rule
 * below is covered by webhook-decision.test.ts without a database.
 *
 * Authentication (is this event really from the provider?) is the
 * provider's job. This answers a different question: given a genuine event,
 * is it consistent with what we actually asked the customer to pay?
 */

export type WebhookRejectReason =
  | "payment_binding_mismatch" // event was signed for a different payment than the one its reference resolves to
  | "currency_mismatch"
  | "amount_mismatch"
  | "paid_after_failure" // money arrived for a payment we'd already marked dead
  | "booking_not_payable"; // money arrived but the booking expired/cancelled meanwhile

export type WebhookIgnoreReason = "event_type_ignored" | "already_settled" | "already_failed";

export type WebhookDecision =
  | { action: "apply" }
  | { action: "ignore"; reason: WebhookIgnoreReason }
  | { action: "reject"; reason: WebhookRejectReason };

export interface DecisionInput {
  event: Pick<VerifiedWebhookEvent, "outcome" | "amount" | "currency" | "expectedPaymentId">;
  payment: { id: string; status: string; originalAmount: string; originalCurrency: string };
  bookingStatus: string;
  amountTolerance: number;
}

const SETTLED = new Set(["PAID", "REFUND_PENDING", "REFUNDED", "PARTIALLY_REFUNDED"]);
const DEAD = new Set(["FAILED", "CANCELLED"]);

export function evaluateWebhook({ event, payment, bookingStatus, amountTolerance }: DecisionInput): WebhookDecision {
  if (event.expectedPaymentId && event.expectedPaymentId !== payment.id) {
    return { action: "reject", reason: "payment_binding_mismatch" };
  }
  if (event.outcome === "IGNORED") {
    return { action: "ignore", reason: "event_type_ignored" };
  }
  if (SETTLED.has(payment.status)) {
    return { action: "ignore", reason: "already_settled" };
  }
  if (DEAD.has(payment.status)) {
    return event.outcome === "PAID"
      ? { action: "reject", reason: "paid_after_failure" }
      : { action: "ignore", reason: "already_failed" };
  }

  if (event.outcome === "PAID") {
    if (event.currency !== payment.originalCurrency) {
      return { action: "reject", reason: "currency_mismatch" };
    }
    if (Math.abs(event.amount - Number(payment.originalAmount)) > amountTolerance) {
      return { action: "reject", reason: "amount_mismatch" };
    }
    if (bookingStatus !== "PAYMENT_PROCESSING") {
      return { action: "reject", reason: "booking_not_payable" };
    }
  }
  return { action: "apply" };
}

/** Rejections where real money may have moved - these need a human, so they're logged at error level. */
export function involvesPossibleRealMoney(reason: WebhookRejectReason): boolean {
  return reason !== "payment_binding_mismatch";
}
