import { describe, expect, it, vi } from "vitest";
import { BillingService } from "./billing-service.js";
import type { BillingEvent, BillingGateway } from "./billing-gateway.js";
import type { SubscriptionSnapshot } from "./subscription-sync.js";

const FREE = { id: "p-free", code: "free", isActive: true, monthlyPriceUsd: "0.00", stripePriceId: null as string | null };
const GROWTH = { id: "p-growth", code: "growth", isActive: true, monthlyPriceUsd: "49.00", stripePriceId: "price_growth" as string | null };
const STARTER = { id: "p-starter", code: "starter", isActive: true, monthlyPriceUsd: "19.00", stripePriceId: null as string | null };

function makeTenant(over: any = {}) {
  return {
    id: "t1", name: "Acme", planId: FREE.id, stripeCustomerId: null as string | null, stripeSubscriptionId: null as string | null,
    subscriptionStatus: null as string | null, subscriptionCurrentPeriodEnd: null, subscriptionCancelAtPeriodEnd: false, subscriptionEventAt: null as Date | null,
    ...over,
  };
}

/** In-memory stand-in for BillingRepository. */
function makeRepo(tenants: any[], plans: any[]) {
  const events = new Map<string, { id: string; processedAt: Date | null; outcome?: string }>();
  const repo = {
    tenants, plans, events,
    findTenant: async (id: string) => tenants.find((t) => t.id === id) ?? null,
    findTenantByStripeCustomer: async (c: string) => tenants.find((t) => t.stripeCustomerId === c) ?? null,
    setStripeCustomerIfUnset: vi.fn(async (id: string, c: string) => {
      const t = tenants.find((x) => x.id === id);
      if (!t || t.stripeCustomerId) return false;
      t.stripeCustomerId = c;
      return true;
    }),
    applySubscription: vi.fn(async (id: string, patch: any, planId?: string) => {
      Object.assign(tenants.find((t) => t.id === id), patch, planId ? { planId } : {});
    }),
    findPlanByCode: async (c: string) => plans.find((p) => p.code === c) ?? null,
    findPlanById: async (id: string) => plans.find((p) => p.id === id) ?? null,
    findPlanByStripePriceId: async (p: string) => plans.find((x) => x.stripePriceId === p) ?? null,
    setPlanStripePrice: vi.fn(async (id: string, price: string | null) => {
      const p = plans.find((x) => x.id === id);
      p.stripePriceId = price;
      return p;
    }),
    recordEvent: async (eventId: string) => {
      const ex = events.get(eventId);
      if (ex) return ex.processedAt ? { alreadyProcessed: true, row: null } : { alreadyProcessed: false, row: ex };
      const row = { id: `row-${eventId}`, processedAt: null as Date | null };
      events.set(eventId, row);
      return { alreadyProcessed: false, row };
    },
    markEventProcessed: async (rowId: string, outcome: string) => {
      const e = [...events.values()].find((x) => x.id === rowId)!;
      e.processedAt = new Date();
      e.outcome = outcome;
    },
  };
  return repo;
}

const fakeTx: any = { execute: async () => [], transaction: async (cb: any) => cb(fakeTx) };
const fakeDb: any = { transaction: async (cb: any) => cb(fakeTx) };
const ops: any = { writeAuditLog: vi.fn(async () => undefined) };

function makeGateway(over: Partial<BillingGateway> = {}) {
  const gw: BillingGateway & { sub?: SubscriptionSnapshot } = {
    createCustomer: vi.fn(async () => ({ id: "cus_new" })),
    createCheckoutSession: vi.fn(async () => ({ id: "cs_1", url: "https://checkout.stripe.test/cs_1" })),
    createPortalSession: vi.fn(async () => ({ url: "https://portal.stripe.test/p" })),
    retrieveSubscription: vi.fn(async (id: string) => gw.sub ?? { id, customerId: "cus_1", status: "active", priceId: "price_growth", currentPeriodEnd: null, cancelAtPeriodEnd: false }),
    retrievePrice: vi.fn(async (id: string) => ({ id, active: true, currency: "usd", unitAmount: 4900, interval: "month" })),
    verifyWebhook: vi.fn(),
    ...over,
  };
  return gw;
}

const service = (repo: any, gateway: BillingGateway | null, adminAppUrl: string | null = "https://admin.example.test/") =>
  new BillingService(repo, gateway, ops, fakeDb, { adminAppUrl: adminAppUrl ?? undefined }); // null = deliberately unset

describe("startCheckout", () => {
  it("is refused when billing isn't configured", async () => {
    await expect(service(makeRepo([makeTenant()], [FREE, GROWTH]), null).startCheckout("t1", "growth", "u1")).rejects.toThrow(/not configured/);
  });

  it("refuses plans that are unknown, inactive, free, or have no Stripe price", async () => {
    const repo = makeRepo([makeTenant()], [FREE, GROWTH, STARTER, { ...GROWTH, id: "p-old", code: "legacy", isActive: false }]);
    const svc = service(repo, makeGateway());
    await expect(svc.startCheckout("t1", "nope", "u1")).rejects.toThrow(/not found/i);
    await expect(svc.startCheckout("t1", "legacy", "u1")).rejects.toThrow(/not found/i);
    await expect(svc.startCheckout("t1", "free", "u1")).rejects.toThrow(/not available for self-serve/);
    await expect(svc.startCheckout("t1", "starter", "u1")).rejects.toThrow(/not available for self-serve/);
  });

  it("refuses a second subscription (would double-bill) but allows re-subscribing after a terminal one", async () => {
    for (const status of ["active", "trialing", "past_due", "incomplete"]) {
      const svc = service(makeRepo([makeTenant({ subscriptionStatus: status })], [FREE, GROWTH]), makeGateway());
      await expect(svc.startCheckout("t1", "growth", "u1"), status).rejects.toThrow(/already has a subscription/);
    }
    const svc = service(makeRepo([makeTenant({ subscriptionStatus: "canceled", stripeCustomerId: "cus_1" })], [FREE, GROWTH]), makeGateway());
    await expect(svc.startCheckout("t1", "growth", "u1")).resolves.toHaveProperty("url");
  });

  it("creates the Stripe customer once, stores it, and tells Stripe the tenant + return URLs", async () => {
    const repo = makeRepo([makeTenant()], [FREE, GROWTH]);
    const gw = makeGateway();
    const res = await service(repo, gw).startCheckout("t1", "growth", "u1", "owner@acme.test");
    expect(res.url).toBe("https://checkout.stripe.test/cs_1");
    expect(gw.createCustomer).toHaveBeenCalledWith({ tenantId: "t1", name: "Acme", email: "owner@acme.test" });
    expect(repo.tenants[0].stripeCustomerId).toBe("cus_new");
    expect(gw.createCheckoutSession).toHaveBeenCalledWith({
      customerId: "cus_new", priceId: "price_growth", tenantId: "t1", planCode: "growth",
      successUrl: "https://admin.example.test/billing?checkout=success",
      cancelUrl: "https://admin.example.test/billing?checkout=cancelled",
    });
    expect(ops.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: "billing.checkout_started", tenantId: "t1" }));
  });

  it("reuses an existing customer instead of creating another", async () => {
    const gw = makeGateway();
    await service(makeRepo([makeTenant({ stripeCustomerId: "cus_old" })], [FREE, GROWTH]), gw).startCheckout("t1", "growth", "u1");
    expect(gw.createCustomer).not.toHaveBeenCalled();
    expect((gw.createCheckoutSession as any).mock.calls[0][0].customerId).toBe("cus_old");
  });

  it("uses the winner's customer if a concurrent request bound one first", async () => {
    const repo = makeRepo([makeTenant()], [FREE, GROWTH]);
    repo.setStripeCustomerIfUnset.mockImplementationOnce(async () => {
      repo.tenants[0].stripeCustomerId = "cus_winner";
      return false;
    });
    const gw = makeGateway();
    await service(repo, gw).startCheckout("t1", "growth", "u1");
    expect((gw.createCheckoutSession as any).mock.calls[0][0].customerId).toBe("cus_winner");
  });

  it("needs ADMIN_APP_URL to know where to send the tenant back", async () => {
    await expect(service(makeRepo([makeTenant()], [FREE, GROWTH]), makeGateway(), null).startCheckout("t1", "growth", "u1")).rejects.toThrow(/ADMIN_APP_URL/);
  });
});

describe("openPortal", () => {
  it("requires an existing billing account", async () => {
    await expect(service(makeRepo([makeTenant()], [FREE]), makeGateway()).openPortal("t1")).rejects.toThrow(/subscribe to a plan first/);
  });
  it("returns the hosted portal URL for the tenant's own customer", async () => {
    const gw = makeGateway();
    const res = await service(makeRepo([makeTenant({ stripeCustomerId: "cus_1" })], [FREE]), gw).openPortal("t1");
    expect(res.url).toBe("https://portal.stripe.test/p");
    expect(gw.createPortalSession).toHaveBeenCalledWith({ customerId: "cus_1", returnUrl: "https://admin.example.test/billing" });
  });
});

describe("setPlanStripePrice - verified against Stripe before it's stored", () => {
  const setup = (price: any) => {
    const repo = makeRepo([], [{ ...FREE }, { ...GROWTH, stripePriceId: null }, { ...STARTER }]);
    const gw = makeGateway({ retrievePrice: vi.fn(async (id: string) => ({ id, active: true, currency: "usd", unitAmount: 4900, interval: "month", ...price })) });
    return { repo, svc: service(repo, gw) };
  };

  it("stores a price that matches the plan exactly", async () => {
    const { repo, svc } = setup({});
    await svc.setPlanStripePrice("p-growth", "price_growth", "admin1");
    expect(repo.plans.find((p) => p.id === "p-growth").stripePriceId).toBe("price_growth");
  });

  it.each([
    [{ active: false }, /not active/],
    [{ interval: "year" }, /not monthly/],
    [{ interval: null }, /not monthly/],
    [{ currency: "kes" }, /currency is kes/],
    [{ unitAmount: 1900 }, /1900 cents, plan "growth" is 4900/],
  ])("rejects a mismatched price %j", async (price, message) => {
    const { repo, svc } = setup(price);
    await expect(svc.setPlanStripePrice("p-growth", "price_x", "admin1")).rejects.toThrow(message);
    expect(repo.setPlanStripePrice).not.toHaveBeenCalled();
  });

  it("rejects a price already mapped to a different plan", async () => {
    const { repo, svc } = setup({});
    repo.plans.find((p) => p.id === "p-starter").stripePriceId = "price_dup";
    await expect(svc.setPlanStripePrice("p-growth", "price_dup", "admin1")).rejects.toThrow(/already mapped to plan "starter"/);
  });

  it("refuses to set a price it cannot verify, but can always clear one", async () => {
    const repo = makeRepo([], [{ ...GROWTH }]);
    const svc = service(repo, null);
    await expect(svc.setPlanStripePrice("p-growth", "price_growth", "admin1")).rejects.toThrow(/not configured/);
    await expect(svc.setPlanStripePrice("p-growth", null, "admin1")).resolves.toBeTruthy();
  });
});

describe("handleWebhook", () => {
  const evt = (type: string, object: any, over: Partial<BillingEvent> = {}): BillingEvent => ({ id: `evt_${Math.random().toString(36).slice(2)}`, type, created: new Date("2026-03-01T00:00:00Z"), object, ...over });
  const subObj = (over: any = {}) => ({
    id: "sub_1", customer: "cus_1", status: "active", current_period_end: 1_790_000_000, cancel_at_period_end: false,
    items: { data: [{ price: { id: "price_growth" } }] }, metadata: { tenantId: "t1" }, ...over,
  });
  const setup = (tenantOver: any = {}) => {
    const repo = makeRepo([makeTenant({ stripeCustomerId: "cus_1", ...tenantOver })], [FREE, GROWTH]);
    const gw = makeGateway();
    return { repo, gw, svc: service(repo, gw) };
  };
  const deliver = (gw: BillingGateway, svc: BillingService, e: BillingEvent) => {
    (gw.verifyWebhook as any).mockReturnValueOnce(e);
    return svc.handleWebhook("{}", "sig");
  };

  it("writes nothing when the signature is invalid", async () => {
    const { repo, gw, svc } = setup();
    (gw.verifyWebhook as any).mockImplementationOnce(() => { throw new Error("Invalid Stripe signature"); });
    await expect(svc.handleWebhook("{}", "bad")).rejects.toThrow(/Invalid/);
    expect(repo.events.size).toBe(0);
    expect(repo.applySubscription).not.toHaveBeenCalled();
  });

  it("upgrades the tenant when a subscription becomes active", async () => {
    const { repo, gw, svc } = setup();
    const res = await deliver(gw, svc, evt("customer.subscription.created", subObj()));
    expect(res).toMatchObject({ deduplicated: false, outcome: "applied_upgrade_or_change" });
    expect(repo.tenants[0]).toMatchObject({ planId: GROWTH.id, stripeSubscriptionId: "sub_1", subscriptionStatus: "active" });
  });

  it("processes a redelivered event only once", async () => {
    const { repo, gw, svc } = setup();
    const e = evt("customer.subscription.created", subObj());
    await deliver(gw, svc, e);
    const again = await deliver(gw, svc, e);
    expect(again).toEqual({ deduplicated: true });
    expect(repo.applySubscription).toHaveBeenCalledTimes(1);
  });

  it("re-processes an event whose earlier attempt crashed before completing", async () => {
    const { repo, gw, svc } = setup();
    const e = evt("customer.subscription.created", subObj());
    repo.applySubscription.mockImplementationOnce(async () => { throw new Error("db blip"); });
    await expect(deliver(gw, svc, e)).rejects.toThrow(/db blip/);
    const retry = await deliver(gw, svc, e);
    expect(retry).toMatchObject({ deduplicated: false, outcome: "applied_upgrade_or_change" });
  });

  it("checkout.session.completed fetches the subscription from Stripe instead of trusting the session body", async () => {
    const { repo, gw, svc } = setup();
    const res = await deliver(gw, svc, evt("checkout.session.completed", { mode: "subscription", subscription: "sub_1", client_reference_id: "t1" }));
    expect(gw.retrieveSubscription).toHaveBeenCalledWith("sub_1");
    expect(res).toMatchObject({ outcome: "applied_upgrade_or_change" });
    expect(repo.tenants[0].planId).toBe(GROWTH.id);
  });

  it("ignores one-off (non-subscription) checkout sessions", async () => {
    const { gw, svc } = setup();
    expect(await deliver(gw, svc, evt("checkout.session.completed", { mode: "payment" }))).toMatchObject({ outcome: "ignored_other" });
    expect(gw.retrieveSubscription).not.toHaveBeenCalled();
  });

  it("downgrades to the free plan when the subscription is deleted", async () => {
    const { repo, gw, svc } = setup({ planId: GROWTH.id, stripeSubscriptionId: "sub_1", subscriptionStatus: "active" });
    const res = await deliver(gw, svc, evt("customer.subscription.deleted", subObj({ status: "canceled" })));
    expect(res).toMatchObject({ outcome: "applied_downgrade_to_free" });
    expect(repo.tenants[0]).toMatchObject({ planId: FREE.id, subscriptionStatus: "canceled" });
  });

  it("does not downgrade a tenant who already re-subscribed when the OLD subscription's delete arrives late", async () => {
    const { repo, gw, svc } = setup({ planId: GROWTH.id, stripeSubscriptionId: "sub_NEW", subscriptionStatus: "active" });
    const res = await deliver(gw, svc, evt("customer.subscription.deleted", subObj({ id: "sub_OLD", status: "canceled" })));
    expect(res).toMatchObject({ outcome: "ignored_superseded_subscription" });
    expect(repo.tenants[0].planId).toBe(GROWTH.id);
  });

  it("ignores an out-of-order (older) event", async () => {
    const { repo, gw, svc } = setup({ subscriptionEventAt: new Date("2026-03-02T00:00:00Z"), planId: GROWTH.id });
    const res = await deliver(gw, svc, evt("customer.subscription.updated", subObj({ status: "canceled" }), { created: new Date("2026-03-01T00:00:00Z") }));
    expect(res).toMatchObject({ outcome: "ignored_stale_event" });
    expect(repo.tenants[0].subscriptionStatus).toBeNull();
  });

  it("ignores an event for a customer no tenant owns, and records it as processed", async () => {
    const { repo, gw, svc } = setup();
    const res = await deliver(gw, svc, evt("customer.subscription.updated", subObj({ customer: "cus_stranger", metadata: {} })));
    expect(res).toMatchObject({ outcome: "ignored_unknown_tenant" });
    expect(repo.applySubscription).not.toHaveBeenCalled();
    expect([...repo.events.values()][0]?.processedAt).toBeInstanceOf(Date);
  });

  it("refuses an event whose tenant hint points at a tenant bound to a DIFFERENT Stripe customer", async () => {
    const { repo, gw, svc } = setup({ stripeCustomerId: "cus_REAL" });
    const res = await deliver(gw, svc, evt("customer.subscription.updated", subObj({ customer: "cus_ATTACKER" })));
    expect(res).toMatchObject({ outcome: "ignored_customer_mismatch" });
    expect(repo.applySubscription).not.toHaveBeenCalled();
  });

  it("leaves the plan untouched, and says so, when a paid price maps to no plan", async () => {
    const { repo, gw, svc } = setup({ planId: FREE.id });
    const res = await deliver(gw, svc, evt("customer.subscription.updated", subObj({ items: { data: [{ price: { id: "price_unmapped" } }] } })));
    expect(res).toMatchObject({ outcome: "applied" });
    expect(repo.tenants[0].planId).toBe(FREE.id);
    expect(repo.tenants[0].subscriptionStatus).toBe("active");
  });

  it("ignores event types it doesn't act on", async () => {
    const { gw, svc } = setup();
    expect(await deliver(gw, svc, evt("invoice.paid", {}))).toMatchObject({ outcome: "ignored_other" });
  });
});
