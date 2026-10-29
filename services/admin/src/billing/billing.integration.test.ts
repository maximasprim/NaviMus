import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createDb, runInTenantContext } from "@travel/database";
import { BillingRepository } from "./billing-repository.js";
import { BillingService } from "./billing-service.js";
import type { BillingEvent, BillingGateway } from "./billing-gateway.js";

/**
 * Billing against a REAL Postgres, connected as the unprivileged `travel_app`
 * role so row-level security is in force - what the unit tests (in-memory
 * fakes) cannot prove: that webhook writes to `tenants` succeed under the
 * explicit bypass, that a mid-event failure rolls the event row back so a
 * retry reprocesses it, that concurrent duplicate deliveries apply once, and
 * that the database's own unique constraints back the rules up.
 *
 * Needs a migrated + seeded database. Skipped when the URLs are absent.
 *   RLS_TEST_ADMIN_URL  owner connection (ground truth + fixtures)
 *   RLS_TEST_APP_URL    connection as travel_app
 */
const ADMIN_URL = process.env.RLS_TEST_ADMIN_URL;
const APP_URL = process.env.RLS_TEST_APP_URL;
const maybe = ADMIN_URL && APP_URL ? describe : describe.skip;

maybe("billing (real database, as travel_app)", () => {
  const admin = postgres(ADMIN_URL ?? "", { max: 2 });
  const db = createDb(APP_URL ?? "", { name: "billing-itest", poolMax: 6 });
  const tag = `itest${Date.now()}`;
  let freePlanId = "";
  let paidPlanId = "";
  let tenantId = "";
  let otherTenantId = "";
  const customerId = `cus_${tag}`;
  const priceId = `price_${tag}`;

  const ops: any = { writeAuditLog: async () => undefined };
  const gateway = (over: Partial<BillingGateway> = {}): BillingGateway & { next?: BillingEvent } => {
    const gw: any = {
      createCustomer: vi.fn(async () => ({ id: customerId })),
      createCheckoutSession: vi.fn(async () => ({ id: "cs", url: "https://checkout.test/x" })),
      createPortalSession: vi.fn(async () => ({ url: "https://portal.test/x" })),
      retrieveSubscription: vi.fn(async (id: string) => ({ id, customerId, status: "active", priceId, currentPeriodEnd: null, cancelAtPeriodEnd: false, tenantIdHint: tenantId })),
      retrievePrice: vi.fn(async (id: string) => ({ id, active: true, currency: "usd", unitAmount: 4900, interval: "month" })),
      verifyWebhook: vi.fn(() => gw.next),
      ...over,
    };
    return gw;
  };
  const svc = (gw: BillingGateway) => new BillingService(new BillingRepository(db), gw, ops, db, { adminAppUrl: "https://admin.test" });

  // One monotonic clock for every event: Stripe's ordering rules compare
  // `created`, so test events must be dated in the order they are "sent".
  let eventSeq = 0;
  const nextEvent = (): { id: string; created: Date } => {
    eventSeq++;
    return { id: `evt_${tag}_${eventSeq}`, created: new Date(Date.UTC(2030, 0, 1, 0, 0, eventSeq)) };
  };
  const subEvent = (type: string, status: string, over: any = {}, meta: Partial<{ id: string; created: Date }> = {}): BillingEvent => ({
    ...nextEvent(),
    ...meta,
    type,
    object: {
      id: `sub_${tag}`, customer: customerId, status, current_period_end: 1_900_000_000, cancel_at_period_end: false,
      items: { data: [{ price: { id: priceId } }] }, metadata: { tenantId }, ...over,
    },
  });
  const tenantRow = async () => (await admin`select plan_id, subscription_status, stripe_customer_id, stripe_subscription_id from tenants where id = ${tenantId}`)[0]!;
  const eventRows = async (id: string) => admin`select processed_at, outcome from billing_events where event_id = ${id}`;

  beforeAll(async () => {
    [{ id: freePlanId }] = (await admin`select id from plans where code = 'free'`) as any;
    expect(freePlanId, "seed a 'free' plan first").toBeTruthy();
    [{ id: paidPlanId }] = (await admin`insert into plans (code, name, monthly_price_usd, stripe_price_id) values (${tag}, 'ITest paid', 49, ${priceId}) returning id`) as any;
    [{ id: tenantId }] = (await admin`insert into tenants (name, slug, plan_id) values ('ITest billing', ${tag}, ${freePlanId}) returning id`) as any;
    [{ id: otherTenantId }] = (await admin`insert into tenants (name, slug, plan_id) values ('ITest other', ${tag + "-o"}, ${freePlanId}) returning id`) as any;
  });

  afterAll(async () => {
    await admin`delete from billing_events where event_id like ${"evt_" + tag + "%"}`;
    await admin`delete from tenants where id in (${tenantId}, ${otherTenantId})`;
    await admin`delete from plans where id = ${paidPlanId}`;
    await admin.end();
  });

  it("checkout, run inside the tenant's own context, binds a Stripe customer to its own row", async () => {
    const gw = gateway();
    const res = await runInTenantContext(db, tenantId, () => svc(gw).startCheckout(tenantId, tag, "u1", "o@x.test"));
    expect(res.url).toBe("https://checkout.test/x");
    expect((await tenantRow()).stripe_customer_id).toBe(customerId);
  });

  it("a subscription webhook upgrades the tenant (a bypass write that RLS would otherwise block)", async () => {
    const gw = gateway();
    gw.next = subEvent("customer.subscription.created", "active");
    const res = await svc(gw).handleWebhook("{}", "sig");
    expect(res).toMatchObject({ deduplicated: false, outcome: "applied_upgrade_or_change" });
    expect(await tenantRow()).toMatchObject({ plan_id: paidPlanId, subscription_status: "active", stripe_subscription_id: `sub_${tag}` });
    const rows = await eventRows(gw.next.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.processed_at).not.toBeNull();
  });

  it("without the bypass, a tenant-scoped session cannot change ANOTHER tenant's subscription (RLS)", async () => {
    const upd = await runInTenantContext(db, otherTenantId, () =>
      db.execute(`update tenants set subscription_status = 'canceled' where id = '${tenantId}' returning id` as any)
    ).catch(() => []);
    expect((upd as any[]).length ?? 0).toBe(0);
    expect((await tenantRow()).subscription_status).toBe("active");
  });

  it("a failure mid-event rolls the event row back, so Stripe's retry reprocesses it", async () => {
    const gw = gateway({ retrieveSubscription: vi.fn(async () => { throw new Error("stripe down"); }) });
    const rb = nextEvent();
    gw.next = { ...rb, type: "checkout.session.completed", object: { mode: "subscription", subscription: `sub_${tag}`, client_reference_id: tenantId } };
    await expect(svc(gw).handleWebhook("{}", "sig")).rejects.toThrow(/stripe down/);
    expect(await eventRows(rb.id)).toHaveLength(0); // rolled back with the transaction

    const ok = gateway();
    ok.next = gw.next;
    const retry = await svc(ok).handleWebhook("{}", "sig");
    expect(retry).toMatchObject({ deduplicated: false, outcome: "applied" }); // really applied, not just "not a duplicate"
    expect((await eventRows(rb.id))[0]!.processed_at).not.toBeNull();
  });

  it("two concurrent deliveries of the same event apply exactly once", async () => {
    const gw = gateway();
    const e = subEvent("customer.subscription.updated", "past_due");
    gw.next = e;
    const results = await Promise.all([svc(gw).handleWebhook("{}", "s"), svc(gw).handleWebhook("{}", "s"), svc(gw).handleWebhook("{}", "s")]);
    expect(results.filter((r) => !r.deduplicated)).toHaveLength(1);
    expect(results.filter((r) => r.deduplicated)).toHaveLength(2);
    expect(await eventRows(e.id)).toHaveLength(1);
  });

  it("past_due keeps the paid plan; cancellation downgrades to the free plan, never to none", async () => {
    expect(await tenantRow()).toMatchObject({ subscription_status: "past_due", plan_id: paidPlanId });
    const gw = gateway();
    gw.next = subEvent("customer.subscription.deleted", "canceled");
    await svc(gw).handleWebhook("{}", "s");
    const t = await tenantRow();
    expect(t.subscription_status).toBe("canceled");
    expect(t.plan_id).toBe(freePlanId);
    expect(t.plan_id).not.toBeNull();
  });

  it("an older event arriving after a newer one is ignored", async () => {
    const gw = gateway();
    gw.next = subEvent("customer.subscription.updated", "active", {}, { created: new Date(Date.UTC(2029, 0, 1)) }); // far older than what's applied
    const res = await svc(gw).handleWebhook("{}", "s");
    expect(res).toMatchObject({ outcome: "ignored_stale_event" });
    expect((await tenantRow()).subscription_status).toBe("canceled");
  });

  it("the database itself refuses two tenants sharing a Stripe customer, and two plans sharing a price", async () => {
    await expect(admin`update tenants set stripe_customer_id = ${customerId} where id = ${otherTenantId}`).rejects.toThrow(/unique/i);
    await expect(admin`insert into plans (code, name, stripe_price_id) values (${tag + "x"}, 'dup', ${priceId})`).rejects.toThrow(/unique/i);
  });
});
