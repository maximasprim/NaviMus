import Stripe from "stripe";
import { env } from "@travel/config";
import { ExternalServiceError, PaymentError } from "@travel/types";
import type {
  CreateIntentParams,
  CreateIntentResult,
  PaymentProvider,
  RefundParams,
  RefundResult,
  VerifiedWebhookEvent,
} from "./payment-provider.js";

function getClient(): Stripe {
  if (!env.STRIPE_SECRET_KEY) {
    throw new PaymentError("Stripe is not configured on this environment");
  }
  return new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });
}

export class StripeProvider implements PaymentProvider {
  readonly name = "stripe" as const;
  readonly amountTolerance = 0.01;

  async createIntent(params: CreateIntentParams): Promise<CreateIntentResult> {
    const stripe = getClient();
    try {
      const intent = await stripe.paymentIntents.create({
        amount: Math.round(params.amount * 100), // Stripe uses the smallest currency unit
        currency: params.currency.toLowerCase(),
        description: params.description,
        metadata: { bookingId: params.bookingId, paymentId: params.paymentId },
        automatic_payment_methods: { enabled: true },
      });
      return {
        providerReference: intent.id,
        status: intent.status === "requires_capture" ? "AUTHORIZED" : "PENDING",
        raw: intent,
      };
    } catch (err) {
      throw new ExternalServiceError("Stripe", err instanceof Error ? err.message : "Failed to create PaymentIntent");
    }
  }

  async verifyWebhook(
    rawBody: string,
    headers: Record<string, string | undefined>
  ): Promise<VerifiedWebhookEvent> {
    if (!env.STRIPE_WEBHOOK_SECRET) {
      throw new PaymentError("Stripe webhook secret is not configured on this environment");
    }
    const signature = headers["stripe-signature"];
    if (!signature) {
      throw new PaymentError("Missing Stripe-Signature header");
    }

    const stripe = getClient();
    let event: Stripe.Event;
    try {
      // constructEvent verifies the HMAC signature - this is what prevents
      // a forged request from ever being treated as a real payment.
      event = stripe.webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      throw new PaymentError("Invalid Stripe webhook signature");
    }

    // Refund lifecycle (a refund Stripe could not settle immediately). The
    // payload is a Refund, not a PaymentIntent - parse it as one.
    if (event.type === "refund.updated" || event.type === "charge.refund.updated") {
      const refund = event.data.object as Stripe.Refund;
      const outcome: VerifiedWebhookEvent["outcome"] =
        refund.status === "succeeded" ? "REFUND_SUCCEEDED" : refund.status === "failed" || refund.status === "canceled" ? "REFUND_FAILED" : "IGNORED";
      return {
        eventId: event.id,
        providerReference: refund.id, // matches payment_refunds.provider_reference
        outcome,
        amount: refund.amount / 100,
        currency: (refund.currency ?? "").toUpperCase(),
        raw: event,
      };
    }

    let outcome: VerifiedWebhookEvent["outcome"];
    switch (event.type) {
      case "payment_intent.succeeded":
        outcome = "PAID";
        break;
      case "payment_intent.payment_failed":
        outcome = "FAILED";
        break;
      case "payment_intent.canceled":
        outcome = "CANCELLED";
        break;
      default:
        // Any event type we don't act on. Returned BEFORE touching payload
        // fields: the old code read intent.currency.toUpperCase() for every
        // event, so an unrelated event with no currency (customer.created,
        // ...) crashed the handler with a 500; and before that, unknown types
        // fell through to FAILED and would have failed a booking.
        return { eventId: event.id, providerReference: "", outcome: "IGNORED", amount: 0, currency: "", raw: event };
    }

    const intent = event.data.object as Stripe.PaymentIntent;
    return {
      eventId: event.id,
      providerReference: intent.id,
      outcome,
      amount: intent.amount / 100,
      currency: intent.currency.toUpperCase(),
      // metadata.paymentId was set by us in createIntent; the payload is
      // signature-verified, so this can be trusted as a binding.
      expectedPaymentId: intent.metadata?.paymentId,
      providerReceipt: intent.id,
      raw: event,
    };
  }

  async refund(params: RefundParams): Promise<RefundResult> {
    const stripe = getClient();
    try {
      const refund = await stripe.refunds.create({
        payment_intent: params.providerReference,
        amount: Math.round(params.amount * 100),
        reason: "requested_by_customer",
      });
      return {
        providerReference: refund.id,
        status: refund.status === "succeeded" ? "REFUNDED" : "REFUND_PENDING",
        raw: refund,
      };
    } catch (err) {
      throw new ExternalServiceError("Stripe", err instanceof Error ? err.message : "Failed to create refund");
    }
  }
}
