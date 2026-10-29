import { boolean, index, integer, numeric, pgTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { idColumn, timestampColumns } from "./_helpers.js";

/**
 * Plans are shared platform reference data (like geography or vehicle
 * types were in Phase 1) - every tenant picks from the same catalog, so
 * this table itself is NOT tenant-scoped. What's tenant-specific is
 * which plan a given tenant is ON (tenants.planId, added below) and
 * their usage against it (computed on demand - see
 * packages/database/src/plan-limits.ts - rather than a separately
 * maintained counter table, since that would mean remembering to
 * increment/decrement a counter at every relevant insert/delete across
 * several services, which is exactly the kind of thing that quietly
 * drifts out of sync. A live COUNT against existing tables can't drift.
 *
 * `maxOperators`/`maxStaffUsers`/`maxBookingsPerMonth` are nullable -
 * null means unlimited (used by the "enterprise" tier, and by any
 * tenant with no plan assigned at all, for backward compatibility with
 * tenants that existed before this table did).
 *
 * `stripePriceId` is a placeholder for real payment-provider
 * integration - this schema is ready for it, but nothing in this
 * codebase actually calls Stripe (or any provider) yet. See
 * services/admin's billing doc comment for exactly what's real here vs.
 * structural-only.
 */
export const plans = pgTable(
  "plans",
  {
    id: idColumn(),
    code: varchar("code", { length: 30 }).notNull(), // free|starter|growth|enterprise
    name: varchar("name", { length: 100 }).notNull(),
    description: text("description"),
    monthlyPriceUsd: numeric("monthly_price_usd", { precision: 10, scale: 2 }).notNull().default("0.00"),
    maxOperators: integer("max_operators"),
    maxStaffUsers: integer("max_staff_users"),
    maxBookingsPerMonth: integer("max_bookings_per_month"),
    // Overrides system_settings' platform_commission_percent default for
    // tenants on this plan (e.g. higher-tier plans charging a lower
    // commission) - read the same tenant-override-then-platform-default
    // way (see services/payments' SettingsRepository), just with the
    // plan as an intermediate fallback layer: tenant-specific setting ->
    // plan default -> platform default.
    commissionRatePercent: numeric("commission_rate_percent", { precision: 5, scale: 2 }),
    isActive: boolean("is_active").notNull().default(true), // inactive plans stay visible to tenants already on them, just not offered to new signups
    stripePriceId: varchar("stripe_price_id", { length: 100 }),
    ...timestampColumns,
  },
  (table) => ({
    codeUnique: uniqueIndex("plans_code_unique").on(table.code),
    activeIdx: index("plans_active_idx").on(table.isActive),
    // A Stripe price maps to exactly one plan, or webhook plan-resolution is ambiguous.
    stripePriceUnique: uniqueIndex("plans_stripe_price_unique")
      .on(table.stripePriceId)
      .where(sql`${table.stripePriceId} IS NOT NULL`),
  })
);

export const plansRelations = relations(plans, () => ({}));

/** Sentinel used by the seed script - the plan every tenant defaults to (including ones created before this table existed). */
export const DEFAULT_PLAN_CODE = "free";
