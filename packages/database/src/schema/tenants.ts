import { boolean, index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { idColumn, softDeleteColumn, timestampColumns } from "./_helpers.js";
import { DEFAULT_TENANT_ID, DEFAULT_TENANT_SLUG } from "./_tenant-constants.js";
import { plans } from "./plans.js";

/**
 * A tenant is a business using this platform. Every tenant-scoped table
 * carries a `tenant_id` column that must be included in every query the
 * application layer issues (see `withTenant` in @travel/database) - this
 * table is the root of that isolation boundary.
 *
 * `slug` is what identifies the tenant on incoming requests (subdomain,
 * header, or path prefix - resolved by the tenant-context middleware in
 * @travel/http) before any auth has happened, so it has to be unique and
 * URL-safe independent of anything else about the tenant.
 *
 * `customDomain` is the same idea for a tenant's own domain (e.g.
 * "acmetravel.com" instead of "acme.NaviMus.travel"). It's a first-class
 * column, not buried in `settings`, because tenant-context.ts needs to
 * look tenants up BY it on every request to a custom domain - that has
 * to be an indexed, unique lookup, not a jsonb scan. `customDomainVerifiedAt`
 * is null until ownership is confirmed (see services/admin's domain
 * verification flow); tenant-context.ts only ever resolves a tenant from
 * a VERIFIED custom domain, never an unverified one - otherwise any
 * tenant could type a domain they don't own into their own settings and
 * have this platform start answering as them for someone else's traffic.
 *
 * The very first tenant seeded (see seed/index.ts) is `default` - every
 * pre-multitenancy row in this database is backfilled onto it, so nothing
 * that existed before this table was added changes behavior.
 */
export const tenants = pgTable(
  "tenants",
  {
    id: idColumn(),
    name: varchar("name", { length: 200 }).notNull(),
    slug: varchar("slug", { length: 100 }).notNull(),
    // active|suspended|trial|cancelled - enforced in app layer against TENANT_STATUSES
    status: varchar("status", { length: 20 }).notNull().default("active"),
    // Free-form per-tenant branding/config (logo key, primary color, default
    // currency, default locale). Kept as jsonb rather than dedicated
    // columns since this list will grow and most of it is opaque to the
    // backend - the frontend apps read and render it. customDomain is
    // the one related field that graduated OUT of here into its own
    // column (see doc comment above) once tenant-context.ts needed to
    // query by it directly.
    settings: jsonb("settings"),
    customDomain: varchar("custom_domain", { length: 255 }),
    customDomainVerifiedAt: timestamp("custom_domain_verified_at", { withTimezone: true }),
    // Nullable - an unassigned tenant is treated as unlimited everywhere
    // plan limits are checked (see plan-limits.ts), which is what keeps
    // this additive: every tenant that existed before plans did just
    // keeps working with no limits until a super_admin assigns one.
    // onDelete "set null" (not "restrict" like tenantIdColumn's FKs)
    // because deleting/retiring a plan should never be blocked by, or
    // cascade into deleting, the tenants currently on it - they just
    // fall back to unlimited until reassigned.
    planId: uuid("plan_id").references(() => plans.id, { onDelete: "set null" }),
    // SaaS billing (the tenant paying US for its plan - unrelated to the
    // customer bookings the payments service collects). Written only by the
    // billing service, driven by signature-verified Stripe webhooks.
    stripeCustomerId: varchar("stripe_customer_id", { length: 100 }),
    stripeSubscriptionId: varchar("stripe_subscription_id", { length: 100 }),
    // Stripe's own status: trialing|active|past_due|canceled|unpaid|incomplete|incomplete_expired|paused.
    // NULL = never subscribed (plan, if any, was assigned manually).
    subscriptionStatus: varchar("subscription_status", { length: 30 }),
    subscriptionCurrentPeriodEnd: timestamp("subscription_current_period_end", { withTimezone: true }),
    subscriptionCancelAtPeriodEnd: boolean("subscription_cancel_at_period_end").notNull().default(false),
    // Stripe `created` time of the last event applied. Stripe does not
    // guarantee delivery order, so an event older than this is stale and ignored.
    subscriptionEventAt: timestamp("subscription_event_at", { withTimezone: true }),
    ownerUserId: uuid("owner_user_id"), // set once the tenant's first admin user is created; nullable to avoid a chicken/egg FK at tenant-creation time
    suspendedAt: timestamp("suspended_at", { withTimezone: true }),
    suspendedReason: text("suspended_reason"),
    ...timestampColumns,
    ...softDeleteColumn,
  },
  (table) => ({
    slugUnique: uniqueIndex("tenants_slug_unique").on(table.slug),
    // Partial unique index (not a plain composite unique) because
    // customDomain is nullable and most tenants will never set one -
    // Postgres treats every NULL as distinct in a unique index already,
    // so a plain unique index technically wouldn't need this WHERE
    // clause to function, but being explicit documents the intent:
    // uniqueness only matters, and is only enforced, once a domain is
    // actually set.
    // One Stripe customer belongs to exactly one tenant.
    stripeCustomerUnique: uniqueIndex("tenants_stripe_customer_unique")
      .on(table.stripeCustomerId)
      .where(sql`${table.stripeCustomerId} IS NOT NULL`),
    customDomainUnique: uniqueIndex("tenants_custom_domain_unique")
      .on(table.customDomain)
      .where(sql`${table.customDomain} IS NOT NULL`),
    statusIdx: index("tenants_status_idx").on(table.status),
    planIdx: index("tenants_plan_idx").on(table.planId),
  })
);

export const tenantsRelations = relations(tenants, ({ one }) => ({
  plan: one(plans, { fields: [tenants.planId], references: [plans.id] }),
}));

/**
 * Re-exported so external code (seed script, migration, services) can do
 * `import { DEFAULT_TENANT_ID } from "@travel/database"` and get both the
 * table and the sentinel id from one place. See _tenant-constants.ts for
 * why the value itself lives elsewhere.
 */
export { DEFAULT_TENANT_ID, DEFAULT_TENANT_SLUG };
