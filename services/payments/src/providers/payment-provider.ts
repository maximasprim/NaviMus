/**
 * Every payment provider (M-Pesa, Stripe, future ones) implements
 * this interface. The Payment service and Booking service depend
 * only on this - never on a provider-specific SDK type - so a new
 * provider can be added without touching booking/payment logic.
 */
export interface CreateIntentParams {
  paymentId: string;
  bookingId: string;
  amount: number;
  currency: string;
  phoneNumber?: string; // required by M-Pesa, ignored by Stripe
  description: string;
}

export interface CreateIntentResult {
  providerReference: string; // e.g. Mpesa CheckoutRequestID, Stripe PaymentIntent id
  status: "PENDING" | "AUTHORIZED";
  raw: unknown;
}

export interface VerifiedWebhookEvent {
  eventId: string; // provider-side unique event/notification id - used for idempotency
  providerReference: string;
  /**
   * "IGNORED" = authentic, but not an event we act on (e.g. Stripe's
   * payment_intent.created). Previously these were mapped to FAILED,
   * which would have failed a booking the instant its intent was created.
   */
  outcome: "PAID" | "FAILED" | "CANCELLED" | "IGNORED" | "REFUND_SUCCEEDED" | "REFUND_FAILED";
  amount: number;
  currency: string;
  /**
   * The payment id the provider cryptographically bound this event to
   * (M-Pesa: the HMAC-signed callback URL; Stripe: signed metadata).
   * When set, the service refuses to apply the event to any other payment.
   */
  expectedPaymentId?: string;
  /** Provider's own receipt/transaction id for the money movement (e.g. M-Pesa receipt number). */
  providerReceipt?: string;
  raw: unknown;
}

/** Transport-level facts the route knows and the provider needs to authenticate a callback. */
export interface WebhookContext {
  paymentId?: string;
  signature?: string;
  clientIp?: string;
}

export interface RefundParams {
  providerReference: string;
  amount: number;
  currency: string;
  reason?: string;
  /** Our payment_refunds row id - lets async providers (M-Pesa) address their callback to it. */
  refundId?: string;
  /** The provider's receipt for the original charge (M-Pesa receipt number); reversals are keyed by it. */
  providerReceipt?: string | null;
  /** The full amount of the original payment, so a provider that can only reverse in full can refuse a partial. */
  originalAmount?: number;
}

export interface RefundResult {
  providerReference: string;
  status: "REFUND_PENDING" | "REFUNDED";
  raw: unknown;
}

export interface PaymentProvider {
  readonly name: "mpesa" | "stripe" | "mock";
  /** Currencies this provider can actually collect. Undefined = no restriction. */
  readonly supportedCurrencies?: readonly string[];
  /** Max |callback amount - expected amount| still accepted (M-Pesa rounds to whole KES). */
  readonly amountTolerance: number;
  createIntent(params: CreateIntentParams): Promise<CreateIntentResult>;
  /**
   * Verifies the webhook signature and parses the payload into a
   * normalized event. Throws if the signature is invalid - callers
   * must never act on an unverified webhook.
   */
  verifyWebhook(
    rawBody: string,
    headers: Record<string, string | undefined>,
    ctx?: WebhookContext
  ): Promise<VerifiedWebhookEvent>;
  refund(params: RefundParams): Promise<RefundResult>;
}
