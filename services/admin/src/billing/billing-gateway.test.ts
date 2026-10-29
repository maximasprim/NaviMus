import Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { StripeBillingGateway, snapshotFromStripeSubscription } from "./billing-gateway.js";

const SECRET = "whsec_test_secret_for_unit_tests";
const stripe = new Stripe("sk_test_dummy", { apiVersion: "2024-06-20" });
// null = deliberately unconfigured (undefined would trigger the default and silently use SECRET)
const gw = (secret: string | null = SECRET) => new StripeBillingGateway("sk_test_dummy", secret ?? undefined, stripe);

const payload = JSON.stringify({
  id: "evt_1",
  object: "event",
  type: "customer.subscription.updated",
  created: 1_790_000_000,
  data: { object: { id: "sub_1", object: "subscription", status: "active" } },
});
const sign = (body: string, secret = SECRET) => stripe.webhooks.generateTestHeaderString({ payload: body, secret });

describe("StripeBillingGateway.verifyWebhook (real Stripe signature scheme)", () => {
  it("accepts a correctly signed payload and normalises it", () => {
    const ev = gw().verifyWebhook(payload, sign(payload));
    expect(ev).toMatchObject({ id: "evt_1", type: "customer.subscription.updated" });
    expect(ev.created.getTime()).toBe(1_790_000_000 * 1000);
    expect(ev.object).toMatchObject({ id: "sub_1", status: "active" });
  });

  it("rejects a payload altered after signing", () => {
    const tampered = payload.replace('"active"', '"canceled"');
    expect(() => gw().verifyWebhook(tampered, sign(payload))).toThrow(/Invalid Stripe signature/);
  });

  it("rejects a signature made with the wrong secret (e.g. the payments endpoint's secret)", () => {
    expect(() => gw().verifyWebhook(payload, sign(payload, "whsec_some_other_endpoint"))).toThrow(/Invalid Stripe signature/);
  });

  it("rejects a missing signature header", () => {
    expect(() => gw().verifyWebhook(payload, undefined)).toThrow(/Missing Stripe signature/);
  });

  it("rejects a replayed old signature (timestamp tolerance)", () => {
    const old = stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET, timestamp: Math.floor(Date.now() / 1000) - 3600 });
    expect(() => gw().verifyWebhook(payload, old)).toThrow(/Invalid Stripe signature/);
  });

  it("fails clearly (not open) when no signing secret is configured", () => {
    expect(() => gw(null).verifyWebhook(payload, sign(payload))).toThrow(/not configured/);
  });
});

describe("snapshotFromStripeSubscription", () => {
  const raw = (over: any = {}) =>
    ({
      id: "sub_1",
      customer: "cus_1",
      status: "active",
      current_period_end: 1_790_000_000,
      cancel_at_period_end: true,
      items: { data: [{ price: { id: "price_growth" } }] },
      metadata: { tenantId: "tenant-1" },
      ...over,
    }) as unknown as Stripe.Subscription;

  it("maps the fields the billing rules use", () => {
    expect(snapshotFromStripeSubscription(raw())).toEqual({
      id: "sub_1",
      customerId: "cus_1",
      status: "active",
      priceId: "price_growth",
      currentPeriodEnd: new Date(1_790_000_000 * 1000),
      cancelAtPeriodEnd: true,
      tenantIdHint: "tenant-1",
    });
  });

  it("handles an expanded customer object, no metadata and no items", () => {
    const s = snapshotFromStripeSubscription(raw({ customer: { id: "cus_9" }, metadata: {}, items: { data: [] } }));
    expect(s.customerId).toBe("cus_9");
    expect(s.tenantIdHint).toBeUndefined();
    expect(s.priceId).toBeNull();
  });
});
