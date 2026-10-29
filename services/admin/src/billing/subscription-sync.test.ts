import { describe, expect, it } from "vitest";
import { decideSubscriptionSync, isLive, type SyncInput } from "./subscription-sync.js";

const FREE = { id: "plan-free", code: "free" };
const GROWTH = { id: "plan-growth", code: "growth" };
const T0 = new Date("2026-01-01T00:00:00Z");
const T1 = new Date("2026-01-01T00:05:00Z");

const base = (over: Partial<SyncInput> = {}): SyncInput => ({
  tenant: { id: "t1", planId: FREE.id, stripeCustomerId: "cus_1", stripeSubscriptionId: null, subscriptionEventAt: null },
  sub: { id: "sub_1", customerId: "cus_1", status: "active", priceId: "price_growth", currentPeriodEnd: new Date("2026-02-01T00:00:00Z"), cancelAtPeriodEnd: false },
  eventCreatedAt: T1,
  planForPrice: GROWTH,
  freePlan: FREE,
  ...over,
});

describe("decideSubscriptionSync - entitlement", () => {
  it("moves the tenant to the paid plan when the subscription becomes active", () => {
    const d = decideSubscriptionSync(base());
    expect(d).toMatchObject({ action: "apply", planId: GROWTH.id, planChange: "upgrade_or_change", warnings: [] });
    if (d.action === "apply") expect(d.patch).toMatchObject({ stripeSubscriptionId: "sub_1", subscriptionStatus: "active", subscriptionEventAt: T1 });
  });

  it("does not rewrite the plan when it's already right", () => {
    const d = decideSubscriptionSync(base({ tenant: { ...base().tenant, planId: GROWTH.id } }));
    expect(d).toMatchObject({ action: "apply", planChange: "none", planId: undefined });
  });

  it("keeps the paid plan during dunning (past_due) - the card is still being retried", () => {
    const d = decideSubscriptionSync(base({ tenant: { ...base().tenant, planId: GROWTH.id }, sub: { ...base().sub, status: "past_due" } }));
    expect(d).toMatchObject({ action: "apply", planChange: "none" });
    if (d.action === "apply") expect(d.patch.subscriptionStatus).toBe("past_due");
  });

  it("treats a trial as entitled", () => {
    expect(decideSubscriptionSync(base({ sub: { ...base().sub, status: "trialing" } }))).toMatchObject({ planChange: "upgrade_or_change", planId: GROWTH.id });
  });

  it("never changes the plan on a price no plan maps to, and warns", () => {
    const d = decideSubscriptionSync(base({ planForPrice: null, tenant: { ...base().tenant, planId: GROWTH.id } }));
    expect(d).toMatchObject({ action: "apply", planChange: "none", warnings: ["unknown_price"] });
  });
});

describe("decideSubscriptionSync - downgrade safety", () => {
  const cancelled = (over: Partial<SyncInput["sub"]> = {}) => ({ ...base().sub, status: "canceled", ...over });

  it("downgrades to the FREE plan when the subscription is cancelled", () => {
    const d = decideSubscriptionSync(base({ tenant: { ...base().tenant, planId: GROWTH.id, stripeSubscriptionId: "sub_1" }, sub: cancelled() }));
    expect(d).toMatchObject({ action: "apply", planId: FREE.id, planChange: "downgrade_to_free" });
  });

  it.each(["unpaid", "incomplete_expired"])("also downgrades on terminal status %s", (status) => {
    const d = decideSubscriptionSync(base({ tenant: { ...base().tenant, planId: GROWTH.id, stripeSubscriptionId: "sub_1" }, sub: cancelled({ status }) }));
    expect(d).toMatchObject({ planId: FREE.id, planChange: "downgrade_to_free" });
  });

  it("NEVER nulls the plan when there is no free plan (null plan = unlimited here)", () => {
    const d = decideSubscriptionSync(base({ freePlan: null, tenant: { ...base().tenant, planId: GROWTH.id, stripeSubscriptionId: "sub_1" }, sub: cancelled() }));
    expect(d).toMatchObject({ action: "apply", planChange: "none", warnings: ["no_free_plan"] });
    if (d.action === "apply") {
      expect(d.planId).toBeUndefined();
      expect("planId" in d && d.planId === null).toBe(false);
    }
  });

  it("ignores a delayed 'cancelled' for an OLD subscription once the tenant has re-subscribed", () => {
    const d = decideSubscriptionSync(
      base({ tenant: { ...base().tenant, planId: GROWTH.id, stripeSubscriptionId: "sub_NEW" }, sub: cancelled({ id: "sub_OLD" }) })
    );
    expect(d).toEqual({ action: "ignore", reason: "superseded_subscription" });
  });

  it("adopts a live subscription that differs from the stored one (a genuine new subscription)", () => {
    const d = decideSubscriptionSync(base({ tenant: { ...base().tenant, stripeSubscriptionId: "sub_OLD" }, sub: { ...base().sub, id: "sub_NEW" } }));
    expect(d.action).toBe("apply");
    if (d.action === "apply") expect(d.patch.stripeSubscriptionId).toBe("sub_NEW");
  });

  it("leaves the plan alone for incomplete/paused", () => {
    for (const status of ["incomplete", "paused"]) {
      expect(decideSubscriptionSync(base({ sub: { ...base().sub, status } }))).toMatchObject({ action: "apply", planChange: "none" });
    }
  });
});

describe("decideSubscriptionSync - ordering and binding", () => {
  it("ignores an event older than the last one applied (out-of-order delivery)", () => {
    const d = decideSubscriptionSync(base({ eventCreatedAt: T0, tenant: { ...base().tenant, subscriptionEventAt: T1 } }));
    expect(d).toEqual({ action: "ignore", reason: "stale_event" });
  });

  it("applies an event with the same timestamp (one-second resolution can't order ties)", () => {
    expect(decideSubscriptionSync(base({ eventCreatedAt: T1, tenant: { ...base().tenant, subscriptionEventAt: T1 } })).action).toBe("apply");
  });

  it("refuses an event for a different Stripe customer than the tenant is bound to", () => {
    expect(decideSubscriptionSync(base({ sub: { ...base().sub, customerId: "cus_OTHER" } }))).toEqual({ action: "ignore", reason: "customer_mismatch" });
  });

  it("adopts the customer when the tenant has none yet", () => {
    const d = decideSubscriptionSync(base({ tenant: { ...base().tenant, stripeCustomerId: null } }));
    expect(d.action).toBe("apply");
    if (d.action === "apply") expect(d.patch.stripeCustomerId).toBe("cus_1");
  });
});

describe("isLive", () => {
  it("is true for anything Stripe still considers a live subscription, false once terminal or absent", () => {
    for (const s of ["active", "trialing", "past_due", "incomplete", "paused"]) expect(isLive(s), s).toBe(true);
    for (const s of ["canceled", "unpaid", "incomplete_expired", null, undefined]) expect(isLive(s as any), String(s)).toBe(false);
  });
});
