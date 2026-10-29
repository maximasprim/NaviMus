import { and, eq, gte, isNull, ne, sql } from "drizzle-orm";
import { PlanLimitError } from "@travel/types";
import * as schema from "./schema/index.js";
import type { Database } from "./client.js";

export interface PlanLimits {
  planId: string | null;
  planCode: string | null;
  planName: string | null;
  maxOperators: number | null;
  maxStaffUsers: number | null;
  maxBookingsPerMonth: number | null;
  commissionRatePercent: number | null;
}

const UNLIMITED: PlanLimits = {
  planId: null,
  planCode: null,
  planName: null,
  maxOperators: null,
  maxStaffUsers: null,
  maxBookingsPerMonth: null,
  commissionRatePercent: null,
};

/**
 * Looks up the plan a tenant is on and its limits. A tenant with no
 * plan assigned (planId null) is treated as UNLIMITED, not "plan not
 * found" - this is what keeps plans additive: every tenant that existed
 * before this table did just keeps working with no limits until a
 * super_admin assigns one (see services/admin's plan-assignment route).
 */
export async function getTenantPlanLimits(db: Database, tenantId: string): Promise<PlanLimits> {
  const [row] = await db
    .select({ plan: schema.plans })
    .from(schema.tenants)
    .innerJoin(schema.plans, eq(schema.tenants.planId, schema.plans.id))
    .where(eq(schema.tenants.id, tenantId))
    .limit(1);

  if (!row) return UNLIMITED;
  return {
    planId: row.plan.id,
    planCode: row.plan.code,
    planName: row.plan.name,
    maxOperators: row.plan.maxOperators,
    maxStaffUsers: row.plan.maxStaffUsers,
    maxBookingsPerMonth: row.plan.maxBookingsPerMonth,
    commissionRatePercent: row.plan.commissionRatePercent ? Number(row.plan.commissionRatePercent) : null,
  };
}

/**
 * Calendar-month usage, not a rolling 30 days or a billing-cycle
 * anchor - the simplest definition of "this month" that needs no
 * additional per-tenant anchor-date tracking. A real billing system
 * would likely anchor to the tenant's signup/invoice date instead;
 * this is a deliberate simplification, not an oversight.
 */
function startOfCurrentMonthUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export async function countBookingsThisMonth(db: Database, tenantId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.bookings)
    .where(and(eq(schema.bookings.tenantId, tenantId), gte(schema.bookings.createdAt, startOfCurrentMonthUtc())));
  return row?.count ?? 0;
}

export async function countActiveOperators(db: Database, tenantId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.operators)
    .where(and(eq(schema.operators.tenantId, tenantId), isNull(schema.operators.deletedAt), ne(schema.operators.status, "rejected")));
  return row?.count ?? 0;
}

/**
 * "Staff" = users who hold any role other than the default "customer"
 * one - admins, operator staff, support, etc. Counted via a join
 * through user_roles/roles rather than a dedicated flag, since role
 * membership is already the source of truth for who's staff (see
 * identity.ts's doc comment on the roles table).
 */
export async function countStaffUsers(db: Database, tenantId: string): Promise<number> {
  const rows = await db
    .selectDistinct({ userId: schema.users.id })
    .from(schema.users)
    .innerJoin(schema.userRoles, eq(schema.userRoles.userId, schema.users.id))
    .innerJoin(schema.roles, eq(schema.roles.id, schema.userRoles.roleId))
    .where(and(eq(schema.users.tenantId, tenantId), ne(schema.roles.name, "customer"), isNull(schema.users.deletedAt)));
  return rows.length;
}

export interface TenantUsageSnapshot {
  plan: PlanLimits;
  usage: {
    bookingsThisMonth: number;
    activeOperators: number;
    staffUsers: number;
  };
  atLimit: {
    bookingsThisMonth: boolean;
    activeOperators: boolean;
    staffUsers: boolean;
  };
}

/** Everything a tenant's own "Usage & Billing" screen needs in one call. */
export async function getTenantUsageSnapshot(db: Database, tenantId: string): Promise<TenantUsageSnapshot> {
  const [plan, bookingsThisMonth, activeOperators, staffUsers] = await Promise.all([
    getTenantPlanLimits(db, tenantId),
    countBookingsThisMonth(db, tenantId),
    countActiveOperators(db, tenantId),
    countStaffUsers(db, tenantId),
  ]);
  return {
    plan,
    usage: { bookingsThisMonth, activeOperators, staffUsers },
    atLimit: {
      bookingsThisMonth: plan.maxBookingsPerMonth !== null && bookingsThisMonth >= plan.maxBookingsPerMonth,
      activeOperators: plan.maxOperators !== null && activeOperators >= plan.maxOperators,
      staffUsers: plan.maxStaffUsers !== null && staffUsers >= plan.maxStaffUsers,
    },
  };
}

export interface PlanLimitChecker {
  checkOperatorLimit(tenantId: string): Promise<void>;
  checkStaffLimit(tenantId: string): Promise<void>;
  checkBookingLimit(tenantId: string): Promise<void>;
}

/**
 * The one real implementation of plan-limit enforcement, shared by
 * every service that needs it (operators, bookings) via constructor
 * injection - see OperatorService's PlanLimitChecker doc comment for
 * why services depend on the small interface above rather than this
 * factory or a raw Database directly: it keeps them testable with
 * plain fakes instead of a working drizzle-shaped mock. This is the
 * thing actually wired up in each service's index.ts.
 */
export function createPlanLimitChecker(db: Database): PlanLimitChecker {
  return {
    async checkOperatorLimit(tenantId: string) {
      const plan = await getTenantPlanLimits(db, tenantId);
      if (plan.maxOperators === null) return;
      const count = await countActiveOperators(db, tenantId);
      if (count >= plan.maxOperators) {
        throw new PlanLimitError(
          `This account is on the ${plan.planName} plan, which allows up to ${plan.maxOperators} operators. That limit has been reached.`
        );
      }
    },
    async checkStaffLimit(tenantId: string) {
      const plan = await getTenantPlanLimits(db, tenantId);
      if (plan.maxStaffUsers === null) return;
      const count = await countStaffUsers(db, tenantId);
      if (count >= plan.maxStaffUsers) {
        throw new PlanLimitError(
          `This account is on the ${plan.planName} plan, which allows up to ${plan.maxStaffUsers} staff users. That limit has been reached.`
        );
      }
    },
    async checkBookingLimit(tenantId: string) {
      const plan = await getTenantPlanLimits(db, tenantId);
      if (plan.maxBookingsPerMonth === null) return;
      const count = await countBookingsThisMonth(db, tenantId);
      if (count >= plan.maxBookingsPerMonth) {
        throw new PlanLimitError(
          `This account is on the ${plan.planName} plan, which allows ${plan.maxBookingsPerMonth} bookings per month. That limit has been reached for this month.`
        );
      }
    },
  };
}
