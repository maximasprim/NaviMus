import { createServiceLogger } from "@travel/logger";
import { ConflictError, ExternalServiceError, NotFoundError, ValidationError } from "@travel/types";
import { getTenantUsageSnapshot, withPlatformRLSBypass, type Database } from "@travel/database";
import type { AdminOperationsRepository } from "../repositories/admin-operations-repository.js";
import { snapshotFromStripeSubscription, type BillingEvent, type BillingGateway } from "./billing-gateway.js";
import type { BillingRepository } from "./billing-repository.js";
import { decideSubscriptionSync, isLive, type SubscriptionSnapshot } from "./subscription-sync.js";

const logger = createServiceLogger("billing-service");

export interface BillingConfig {
  /** Public URL of the admin app: where Checkout / the Portal send the tenant back to. */
  adminAppUrl?: string;
}

type EventResult = { outcome: string; tenantId?: string };

/**
 * SaaS billing: tenants paying US for a plan. Entirely separate from the
 * payments service, which collects customers' payments for bookings.
 *
 * Division of labour with Stripe: Stripe hosts every screen that touches a
 * card (Checkout to subscribe, the Billing Portal to change plan / cancel /
 * update the card), so no card data ever reaches this code. The only thing
 * that ever changes a tenant's plan as a result is a signature-verified,
 * deduplicated webhook - never a redirect back from Checkout, which a user
 * could fake by visiting the success URL.
 */
export class BillingService {
  constructor(
    private readonly repo: BillingRepository,
    private readonly gateway: BillingGateway | null,
    private readonly ops: AdminOperationsRepository,
    private readonly db: Database,
    private readonly cfg: BillingConfig = {}
  ) {}

  private requireGateway(): BillingGateway {
    if (!this.gateway) throw new ExternalServiceError("Stripe billing", "billing is not configured on this environment");
    return this.gateway;
  }

  private requireAdminAppUrl(): string {
    if (!this.cfg.adminAppUrl) throw new ExternalServiceError("Stripe billing", "ADMIN_APP_URL is not configured");
    return this.cfg.adminAppUrl.replace(/\/+$/, "");
  }

  get isConfigured() {
    return this.gateway !== null;
  }

  /** The tenant's "Usage & Billing" screen: plan, subscription state, and live usage vs limits. */
  async getOverview(tenantId: string) {
    const tenant = await this.repo.findTenant(tenantId);
    if (!tenant) throw new NotFoundError("Tenant");
    const [snapshot, plans] = await Promise.all([getTenantUsageSnapshot(this.db, tenantId), this.repo.listActivePlans()]);
    return {
      // What the tenant may pick. Stripe price ids are deliberately not exposed.
      availablePlans: plans.map((p) => ({
        code: p.code,
        name: p.name,
        description: p.description,
        monthlyPriceUsd: p.monthlyPriceUsd,
        maxOperators: p.maxOperators,
        maxStaffUsers: p.maxStaffUsers,
        maxBookingsPerMonth: p.maxBookingsPerMonth,
        isCurrent: p.id === tenant.planId,
        // Buying needs a verified Stripe price and a real price.
        purchasable: !!p.stripePriceId && Number(p.monthlyPriceUsd) > 0 && p.id !== tenant.planId,
      })),
      billingEnabled: this.isConfigured,
      subscription: {
        status: tenant.subscriptionStatus,
        currentPeriodEnd: tenant.subscriptionCurrentPeriodEnd,
        cancelAtPeriodEnd: tenant.subscriptionCancelAtPeriodEnd,
        // past_due = Stripe is still retrying the card; the plan is kept meanwhile.
        paymentProblem: tenant.subscriptionStatus === "past_due",
        canManage: !!tenant.stripeCustomerId,
      },
      ...snapshot,
    };
  }

  /** Starts a Stripe Checkout session to subscribe the tenant to `planCode`. Returns the hosted URL to redirect to. */
  async startCheckout(tenantId: string, planCode: string, actorUserId: string, contactEmail?: string) {
    const gateway = this.requireGateway();
    const appUrl = this.requireAdminAppUrl();

    const plan = await this.repo.findPlanByCode(planCode);
    if (!plan || !plan.isActive) throw new NotFoundError("Plan");
    if (!plan.stripePriceId || Number(plan.monthlyPriceUsd) <= 0) {
      throw new ValidationError(`Plan "${plan.code}" is not available for self-serve purchase`);
    }

    const tenant = await this.repo.findTenant(tenantId);
    if (!tenant) throw new NotFoundError("Tenant");
    if (isLive(tenant.subscriptionStatus)) {
      // A second Checkout would create a SECOND subscription and bill twice.
      throw new ConflictError("This account already has a subscription. Use \"Manage subscription\" to change or cancel it.");
    }

    let customerId = tenant.stripeCustomerId;
    if (!customerId) {
      const created = await gateway.createCustomer({ tenantId, name: tenant.name, email: contactEmail });
      const won = await this.repo.setStripeCustomerIfUnset(tenantId, created.id);
      if (won) {
        customerId = created.id;
      } else {
        // A concurrent request bound a customer first (Stripe's idempotency key
        // makes both resolve to the same customer in practice).
        const fresh = await this.repo.findTenant(tenantId);
        customerId = fresh?.stripeCustomerId ?? created.id;
      }
    }

    const session = await gateway.createCheckoutSession({
      customerId,
      priceId: plan.stripePriceId,
      tenantId,
      planCode: plan.code,
      successUrl: `${appUrl}/billing?checkout=success`,
      cancelUrl: `${appUrl}/billing?checkout=cancelled`,
    });

    await this.ops.writeAuditLog({
      tenantId,
      actorUserId,
      action: "billing.checkout_started",
      resourceType: "tenant",
      resourceId: tenantId,
      metadata: { planCode: plan.code },
    });
    return { url: session.url };
  }

  /** Opens Stripe's Billing Portal (change plan, cancel, update card, invoices). */
  async openPortal(tenantId: string) {
    const gateway = this.requireGateway();
    const appUrl = this.requireAdminAppUrl();
    const tenant = await this.repo.findTenant(tenantId);
    if (!tenant) throw new NotFoundError("Tenant");
    if (!tenant.stripeCustomerId) throw new ConflictError("No billing account yet - subscribe to a plan first.");
    const session = await gateway.createPortalSession({ customerId: tenant.stripeCustomerId, returnUrl: `${appUrl}/billing` });
    return { url: session.url };
  }

  /**
   * Maps a plan to its Stripe price (super_admin). Verified against Stripe
   * first: a price that's inactive, one-off, non-USD or not exactly the
   * plan's advertised monthly price would silently bill tenants the wrong
   * amount.
   */
  async setPlanStripePrice(planId: string, priceId: string | null, actorUserId: string) {
    const plan = await this.repo.findPlanById(planId);
    if (!plan) throw new NotFoundError("Plan");

    if (priceId) {
      const gateway = this.requireGateway(); // refuse to set what we cannot verify
      const price = await gateway.retrievePrice(priceId);
      const expectedCents = Math.round(Number(plan.monthlyPriceUsd) * 100);
      const problems: string[] = [];
      if (!price.active) problems.push("price is not active");
      if (price.interval !== "month") problems.push(`price is not monthly (interval: ${price.interval ?? "one-off"})`);
      if (price.currency.toLowerCase() !== "usd") problems.push(`price currency is ${price.currency}, plans are priced in USD`);
      if (price.unitAmount !== expectedCents) problems.push(`price is ${price.unitAmount} cents, plan "${plan.code}" is ${expectedCents}`);
      if (problems.length) throw new ValidationError(`Stripe price ${priceId} does not match plan "${plan.code}": ${problems.join("; ")}`);

      const owner = await this.repo.findPlanByStripePriceId(priceId);
      if (owner && owner.id !== plan.id) throw new ConflictError(`Price ${priceId} is already mapped to plan "${owner.code}"`);
    }

    const updated = await this.repo.setPlanStripePrice(planId, priceId);
    await this.ops.writeAuditLog({
      tenantId: null,
      actorUserId,
      action: "plan.stripe_price_set",
      resourceType: "plan",
      resourceId: planId,
      metadata: { priceId },
    });
    return updated!;
  }

  /**
   * Handles a Stripe billing webhook. The whole thing - recording the event,
   * applying it, marking it processed - is ONE transaction (under an explicit
   * RLS bypass, because the event names its tenant only after it's been
   * verified and read). If anything throws, the event row rolls back with it,
   * so Stripe's retry re-processes it from scratch instead of being dropped as
   * a "duplicate".
   */
  async handleWebhook(rawBody: string, signature: string | undefined) {
    const gateway = this.requireGateway();
    const event = gateway.verifyWebhook(rawBody, signature); // nothing is written before this passes

    return withPlatformRLSBypass(this.db, async () => {
      const { alreadyProcessed, row } = await this.repo.recordEvent(event.id, event.type, event.object);
      if (alreadyProcessed || !row) return { deduplicated: true as const };

      const result = await this.processEvent(gateway, event);
      await this.repo.markEventProcessed(row.id, result.outcome, result.tenantId);
      logger.info({ eventId: event.id, type: event.type, ...result }, "Billing webhook processed");
      return { deduplicated: false as const, outcome: result.outcome };
    });
  }

  private async processEvent(gateway: BillingGateway, event: BillingEvent): Promise<EventResult> {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.object;
        if (session.mode !== "subscription" || !session.subscription) return { outcome: "ignored_other" };
        // Don't trust the redirect OR the session body for plan data: fetch the
        // subscription itself from Stripe and sync from that.
        const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
        const sub = await gateway.retrieveSubscription(subscriptionId);
        return this.syncSubscription({ ...sub, tenantIdHint: sub.tenantIdHint ?? session.client_reference_id ?? undefined }, event.created);
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        return this.syncSubscription(snapshotFromStripeSubscription(event.object), event.created);
      }
      default:
        return { outcome: "ignored_other" };
    }
  }

  private async syncSubscription(sub: SubscriptionSnapshot, eventCreatedAt: Date): Promise<EventResult> {
    // Resolve the tenant: our stamped hint first, else whoever owns the Stripe customer.
    let tenant = sub.tenantIdHint ? await this.repo.findTenant(sub.tenantIdHint) : null;
    if (!tenant) tenant = await this.repo.findTenantByStripeCustomer(sub.customerId);
    if (!tenant) {
      logger.warn({ subscriptionId: sub.id, customerId: sub.customerId }, "Subscription event for an unknown tenant - ignored");
      return { outcome: "ignored_unknown_tenant" };
    }

    const [planForPrice, freePlan] = await Promise.all([
      sub.priceId ? this.repo.findPlanByStripePriceId(sub.priceId) : Promise.resolve(null),
      this.repo.findPlanByCode("free"),
    ]);

    const decision = decideSubscriptionSync({
      tenant: {
        id: tenant.id,
        planId: tenant.planId,
        stripeCustomerId: tenant.stripeCustomerId,
        stripeSubscriptionId: tenant.stripeSubscriptionId,
        subscriptionEventAt: tenant.subscriptionEventAt,
      },
      sub,
      eventCreatedAt,
      planForPrice: planForPrice && { id: planForPrice.id, code: planForPrice.code },
      freePlan: freePlan && { id: freePlan.id, code: freePlan.code },
    });

    if (decision.action === "ignore") {
      logger.warn({ tenantId: tenant.id, subscriptionId: sub.id, reason: decision.reason }, "Subscription event ignored");
      return { outcome: `ignored_${decision.reason}`, tenantId: tenant.id };
    }

    for (const w of decision.warnings) {
      logger.error(
        { tenantId: tenant.id, subscriptionId: sub.id, priceId: sub.priceId, warning: w },
        w === "unknown_price"
          ? "Paid subscription uses a Stripe price no plan maps to - plan NOT changed; map it with PATCH /platform/plans/:id/stripe-price"
          : "Subscription ended but there is no 'free' plan to fall back to - plan NOT changed (a null plan would mean unlimited)"
      );
    }

    await this.repo.applySubscription(tenant.id, decision.patch, decision.planId);
    return { outcome: decision.planChange === "none" ? "applied" : `applied_${decision.planChange}`, tenantId: tenant.id };
  }
}
