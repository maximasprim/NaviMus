import { and, eq, schema, sql, type Database } from "@travel/database";
import type { TenantBillingPatch } from "./subscription-sync.js";

export class BillingRepository {
  constructor(private readonly db: Database) {}

  async findTenant(id: string) {
    const [row] = await this.db.select().from(schema.tenants).where(eq(schema.tenants.id, id)).limit(1);
    return row ?? null;
  }

  async findTenantByStripeCustomer(customerId: string) {
    const [row] = await this.db.select().from(schema.tenants).where(eq(schema.tenants.stripeCustomerId, customerId)).limit(1);
    return row ?? null;
  }

  /** Binds a Stripe customer to a tenant only if it has none yet. Returns false if another request got there first. */
  async setStripeCustomerIfUnset(tenantId: string, customerId: string): Promise<boolean> {
    const rows = await this.db
      .update(schema.tenants)
      .set({ stripeCustomerId: customerId, updatedAt: new Date() })
      .where(and(eq(schema.tenants.id, tenantId), sql`${schema.tenants.stripeCustomerId} IS NULL`))
      .returning({ id: schema.tenants.id });
    return rows.length > 0;
  }

  async applySubscription(tenantId: string, patch: TenantBillingPatch, planId?: string) {
    await this.db
      .update(schema.tenants)
      .set({ ...patch, ...(planId ? { planId } : {}), updatedAt: new Date() })
      .where(eq(schema.tenants.id, tenantId));
  }

  async listActivePlans() {
    return this.db.select().from(schema.plans).where(eq(schema.plans.isActive, true)).orderBy(schema.plans.monthlyPriceUsd);
  }

  async findPlanByCode(code: string) {
    const [row] = await this.db.select().from(schema.plans).where(eq(schema.plans.code, code)).limit(1);
    return row ?? null;
  }

  async findPlanById(id: string) {
    const [row] = await this.db.select().from(schema.plans).where(eq(schema.plans.id, id)).limit(1);
    return row ?? null;
  }

  async findPlanByStripePriceId(priceId: string) {
    const [row] = await this.db.select().from(schema.plans).where(eq(schema.plans.stripePriceId, priceId)).limit(1);
    return row ?? null;
  }

  async setPlanStripePrice(planId: string, priceId: string | null) {
    const [row] = await this.db
      .update(schema.plans)
      .set({ stripePriceId: priceId, updatedAt: new Date() })
      .where(eq(schema.plans.id, planId))
      .returning();
    return row ?? null;
  }

  /**
   * Records an event before acting on it. A repeat delivery only counts as a
   * duplicate if the first one was fully PROCESSED; one that crashed midway
   * is returned for another attempt (see also the payments webhook fix).
   */
  async recordEvent(eventId: string, type: string, payload: unknown) {
    const [inserted] = await this.db
      .insert(schema.billingEvents)
      .values({ eventId, type, payload: payload as any })
      .onConflictDoNothing()
      .returning();
    if (inserted) return { alreadyProcessed: false, row: inserted };
    const [existing] = await this.db.select().from(schema.billingEvents).where(eq(schema.billingEvents.eventId, eventId)).limit(1);
    if (!existing) return { alreadyProcessed: true, row: null };
    return existing.processedAt
      ? { alreadyProcessed: true, row: null }
      : { alreadyProcessed: false, row: existing };
  }

  async markEventProcessed(rowId: string, outcome: string, tenantId?: string) {
    await this.db
      .update(schema.billingEvents)
      .set({ processedAt: new Date(), outcome, tenantId: tenantId ?? null })
      .where(eq(schema.billingEvents.id, rowId));
  }
}
