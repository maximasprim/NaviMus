/**
 * Pure rules for turning a Stripe subscription (as reported by a verified
 * webhook) into a change to a tenant. No database, no network: every rule
 * is covered by subscription-sync.test.ts.
 *
 * The rules exist because Stripe webhooks are at-least-once and unordered,
 * and because getting a downgrade wrong in either direction is costly:
 *   - wrongly downgrading a paying tenant locks them out of what they paid for;
 *   - wrongly leaving a cancelled tenant on a paid plan gives it away;
 *   - and in this code base a tenant with NO plan (planId NULL) is treated as
 *     UNLIMITED (see plan-limits.ts), so "downgrade to nothing" would be the
 *     worst outcome of all. Downgrades therefore go to the free plan, or
 *     not at all.
 */

export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "incomplete"
  | "incomplete_expired"
  | "paused";

/** The tenant keeps (and is entitled to) the plan in these states. past_due is the dunning grace period: Stripe is still retrying the card. */
export const ENTITLED_STATUSES: readonly string[] = ["trialing", "active", "past_due"];
/** Stripe has given up on this subscription for good. */
export const TERMINAL_STATUSES: readonly string[] = ["canceled", "unpaid", "incomplete_expired"];

export const isEntitled = (status: string | null | undefined) => !!status && ENTITLED_STATUSES.includes(status);
export const isTerminal = (status: string | null | undefined) => !!status && TERMINAL_STATUSES.includes(status);
/** A subscription that still exists in Stripe in some live form - starting a second one would double-bill. */
export const isLive = (status: string | null | undefined) => !!status && !TERMINAL_STATUSES.includes(status);

export interface SubscriptionSnapshot {
  id: string;
  customerId: string;
  status: string;
  priceId: string | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  /** metadata.tenantId we stamped on the subscription at checkout. A hint only: it is verified against the customer. */
  tenantIdHint?: string;
}

export interface TenantBillingState {
  id: string;
  planId: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  subscriptionEventAt: Date | null;
}

export interface PlanRef {
  id: string;
  code: string;
}

export interface TenantBillingPatch {
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  subscriptionStatus: string;
  subscriptionCurrentPeriodEnd: Date | null;
  subscriptionCancelAtPeriodEnd: boolean;
  subscriptionEventAt: Date;
}

export type SyncWarning = "unknown_price" | "no_free_plan";

export type SyncDecision =
  | {
      action: "apply";
      patch: TenantBillingPatch;
      /** undefined = leave the plan alone. */
      planId?: string;
      planChange: "none" | "upgrade_or_change" | "downgrade_to_free";
      warnings: SyncWarning[];
    }
  | { action: "ignore"; reason: "stale_event" | "superseded_subscription" | "customer_mismatch" };

export interface SyncInput {
  tenant: TenantBillingState;
  sub: SubscriptionSnapshot;
  eventCreatedAt: Date;
  /** The plan whose stripePriceId equals sub.priceId, if any. */
  planForPrice: PlanRef | null;
  freePlan: PlanRef | null;
}

export function decideSubscriptionSync({ tenant, sub, eventCreatedAt, planForPrice, freePlan }: SyncInput): SyncDecision {
  // 1. A tenant is bound to one Stripe customer. An event for the same tenant
  //    but a different customer is never applied.
  if (tenant.stripeCustomerId && tenant.stripeCustomerId !== sub.customerId) {
    return { action: "ignore", reason: "customer_mismatch" };
  }

  // 2. Stripe does not guarantee ordering. Anything older than what we've
  //    already applied is stale. (Equal timestamps apply: `created` has
  //    one-second resolution, so ties can't be ordered and last-processed wins.)
  if (tenant.subscriptionEventAt && eventCreatedAt < tenant.subscriptionEventAt) {
    return { action: "ignore", reason: "stale_event" };
  }

  // 3. A DELAYED terminal event for an OLD subscription (cancelled, then the
  //    tenant re-subscribed) must not downgrade the tenant who is paying for
  //    the new one. A live event for a different subscription is a legitimate
  //    new subscription and is adopted.
  if (tenant.stripeSubscriptionId && tenant.stripeSubscriptionId !== sub.id && isTerminal(sub.status)) {
    return { action: "ignore", reason: "superseded_subscription" };
  }

  const patch: TenantBillingPatch = {
    stripeCustomerId: sub.customerId,
    stripeSubscriptionId: sub.id,
    subscriptionStatus: sub.status,
    subscriptionCurrentPeriodEnd: sub.currentPeriodEnd,
    subscriptionCancelAtPeriodEnd: sub.cancelAtPeriodEnd,
    subscriptionEventAt: eventCreatedAt,
  };
  const warnings: SyncWarning[] = [];

  if (isEntitled(sub.status)) {
    if (!planForPrice) {
      // Paid, but for a price no plan maps to (misconfiguration). Changing the
      // plan on a guess could lock out a paying tenant, so leave it and shout.
      warnings.push("unknown_price");
      return { action: "apply", patch, planChange: "none", warnings };
    }
    const changed = planForPrice.id !== tenant.planId;
    return {
      action: "apply",
      patch,
      planId: changed ? planForPrice.id : undefined,
      planChange: changed ? "upgrade_or_change" : "none",
      warnings,
    };
  }

  if (isTerminal(sub.status)) {
    if (!freePlan) {
      // No free plan to fall back to, and "no plan" means UNLIMITED here.
      // Never null the plan; record the status and flag it for a human.
      warnings.push("no_free_plan");
      return { action: "apply", patch, planChange: "none", warnings };
    }
    const changed = freePlan.id !== tenant.planId;
    return {
      action: "apply",
      patch,
      planId: changed ? freePlan.id : undefined,
      planChange: changed ? "downgrade_to_free" : "none",
      warnings,
    };
  }

  // incomplete / paused: record the status, don't touch the plan.
  return { action: "apply", patch, planChange: "none", warnings };
}
