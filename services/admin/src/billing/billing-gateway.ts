import Stripe from "stripe";
import { AuthenticationError, ExternalServiceError } from "@travel/types";
import type { SubscriptionSnapshot } from "./subscription-sync.js";

/** A webhook event reduced to what the billing service needs. `object` is Stripe's raw data.object. */
export interface BillingEvent {
  id: string;
  type: string;
  created: Date;
  object: any;
}

export interface PriceSnapshot {
  id: string;
  active: boolean;
  currency: string;
  unitAmount: number | null;
  interval: string | null; // "month" | "year" | null (one-off)
}

/**
 * Everything the billing service needs from Stripe, behind an interface so
 * the business logic is tested with a fake and never needs the network.
 */
export interface BillingGateway {
  createCustomer(p: { tenantId: string; name: string; email?: string }): Promise<{ id: string }>;
  createCheckoutSession(p: {
    customerId: string;
    priceId: string;
    tenantId: string;
    planCode: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ id: string; url: string }>;
  createPortalSession(p: { customerId: string; returnUrl: string }): Promise<{ url: string }>;
  retrieveSubscription(id: string): Promise<SubscriptionSnapshot>;
  retrievePrice(id: string): Promise<PriceSnapshot>;
  /** Throws AuthenticationError unless `signature` is a valid Stripe signature for exactly this raw body. */
  verifyWebhook(rawBody: string, signature: string | undefined): BillingEvent;
}

/** Maps Stripe's subscription object to our snapshot. Exported for tests. */
export function snapshotFromStripeSubscription(sub: Stripe.Subscription): SubscriptionSnapshot {
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  return {
    id: sub.id,
    customerId,
    status: sub.status,
    priceId: sub.items?.data?.[0]?.price?.id ?? null,
    currentPeriodEnd: typeof sub.current_period_end === "number" ? new Date(sub.current_period_end * 1000) : null,
    cancelAtPeriodEnd: !!sub.cancel_at_period_end,
    tenantIdHint: sub.metadata?.tenantId || undefined,
  };
}

export class StripeBillingGateway implements BillingGateway {
  private readonly stripe: Stripe;

  constructor(secretKey: string, private readonly webhookSecret: string | undefined, stripeClient?: Stripe) {
    this.stripe = stripeClient ?? new Stripe(secretKey, { apiVersion: "2024-06-20" });
  }

  private wrap<T>(what: string, fn: () => Promise<T>): Promise<T> {
    return fn().catch((err) => {
      throw new ExternalServiceError("Stripe", `${what} failed: ${err?.message ?? "unknown error"}`);
    });
  }

  createCustomer(p: { tenantId: string; name: string; email?: string }) {
    return this.wrap("create customer", async () => {
      const c = await this.stripe.customers.create(
        { name: p.name, email: p.email, metadata: { tenantId: p.tenantId } },
        // A double-click or retry must not create two Stripe customers for one tenant.
        { idempotencyKey: `tenant-customer-${p.tenantId}` }
      );
      return { id: c.id };
    });
  }

  createCheckoutSession(p: { customerId: string; priceId: string; tenantId: string; planCode: string; successUrl: string; cancelUrl: string }) {
    return this.wrap("create checkout session", async () => {
      const s = await this.stripe.checkout.sessions.create({
        mode: "subscription",
        customer: p.customerId,
        client_reference_id: p.tenantId,
        line_items: [{ price: p.priceId, quantity: 1 }],
        success_url: p.successUrl,
        cancel_url: p.cancelUrl,
        allow_promotion_codes: true,
        metadata: { tenantId: p.tenantId, planCode: p.planCode },
        // Stamped on the SUBSCRIPTION itself so every later subscription.* event carries the tenant.
        subscription_data: { metadata: { tenantId: p.tenantId, planCode: p.planCode } },
      });
      if (!s.url) throw new Error("Stripe returned no checkout URL");
      return { id: s.id, url: s.url };
    });
  }

  createPortalSession(p: { customerId: string; returnUrl: string }) {
    return this.wrap("create portal session", async () => {
      const s = await this.stripe.billingPortal.sessions.create({ customer: p.customerId, return_url: p.returnUrl });
      return { url: s.url };
    });
  }

  retrieveSubscription(id: string) {
    return this.wrap("retrieve subscription", async () => snapshotFromStripeSubscription(await this.stripe.subscriptions.retrieve(id)));
  }

  retrievePrice(id: string) {
    return this.wrap("retrieve price", async () => {
      const p = await this.stripe.prices.retrieve(id);
      return { id: p.id, active: p.active, currency: p.currency, unitAmount: p.unit_amount, interval: p.recurring?.interval ?? null };
    });
  }

  verifyWebhook(rawBody: string, signature: string | undefined): BillingEvent {
    if (!this.webhookSecret) throw new ExternalServiceError("Stripe billing", "webhook signing secret is not configured");
    if (!signature) throw new AuthenticationError("Missing Stripe signature");
    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(rawBody, signature, this.webhookSecret);
    } catch {
      throw new AuthenticationError("Invalid Stripe signature");
    }
    return { id: event.id, type: event.type, created: new Date(event.created * 1000), object: event.data.object };
  }
}
