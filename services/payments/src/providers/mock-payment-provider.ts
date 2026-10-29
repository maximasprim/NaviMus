import { randomUUID } from "node:crypto";
import { createServiceLogger } from "@travel/logger";
import { PaymentError } from "@travel/types";
import type {
  CreateIntentParams,
  CreateIntentResult,
  PaymentProvider,
  RefundParams,
  RefundResult,
  VerifiedWebhookEvent,
} from "./payment-provider.js";

const logger = createServiceLogger("mock-payment-provider");

/**
 * Never processes real money. Used for local dev and CI so the
 * full booking -> payment -> webhook -> confirmed loop can be
 * exercised without Safaricom/Stripe sandbox credentials.
 *
 * Deliberately still webhook-driven rather than auto-confirming
 * inside createIntent - the point is to test the SAME "never trust
 * client-reported payment status" architecture used in production,
 * not a shortcut around it. A test/dev caller simulates the
 * provider by POSTing to /payments/webhooks/mock with the shape
 * this class's verifyWebhook expects.
 *
 * PaymentService gates provider === "mock" out in production (see
 * the isProduction() check at the call site) - this class has no
 * such guard itself, so the gate must never be removed there.
 */
export class MockPaymentProvider implements PaymentProvider {
  readonly name = "mock" as const;
  readonly amountTolerance = 0.01;

  async createIntent(params: CreateIntentParams): Promise<CreateIntentResult> {
    const providerReference = `mock_${randomUUID()}`;
    logger.info(
      { providerReference, bookingId: params.bookingId, amount: params.amount, currency: params.currency },
      "[mock] payment intent created - simulate completion via POST /payments/webhooks/mock"
    );
    return { providerReference, status: "PENDING", raw: { mock: true } };
  }

  /**
   * No real signature to check - "verification" here is just
   * parsing the caller-supplied shape. Safe only because this
   * provider is production-gated at the service layer.
   */
  async verifyWebhook(rawBody: string): Promise<VerifiedWebhookEvent> {
    let payload: {
      providerReference?: string;
      outcome?: "PAID" | "FAILED" | "CANCELLED";
      amount?: number;
      currency?: string;
    };
    try {
      payload = JSON.parse(rawBody);
    } catch {
      throw new PaymentError("Malformed mock webhook payload");
    }
    if (!payload.providerReference || !payload.outcome) {
      throw new PaymentError("Mock webhook payload requires providerReference and outcome");
    }

    return {
      eventId: `mock_${payload.providerReference}_${payload.outcome}_${Date.now()}`,
      providerReference: payload.providerReference,
      outcome: payload.outcome,
      amount: payload.amount ?? 0,
      currency: payload.currency ?? "USD",
      raw: payload,
    };
  }

  async refund(params: RefundParams): Promise<RefundResult> {
    logger.info({ providerReference: params.providerReference, amount: params.amount }, "[mock] refund issued");
    return { providerReference: `mock_refund_${randomUUID()}`, status: "REFUNDED", raw: { mock: true } };
  }
}
