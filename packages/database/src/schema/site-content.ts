import { jsonb, pgTable, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { idColumn, timestampColumns } from "./_helpers.js";
import { tenants } from "./tenants.js";
import { users } from "./identity.js";

/**
 * One row per tenant: the public storefront content that tenant's admins edit from the admin console
 * (hero, testimonials, story, contact, ...). The document's shape and limits live in
 * @travel/validation (site-content.ts); this table just stores it.
 *
 * Two deliberate departures from the other tenant-owned tables:
 *
 *  - tenant_id has NO default. Everywhere else a forgotten tenant id silently lands on the default
 *    tenant (see tenantIdColumn); for content that is publicly displayed, a forgotten tenant id
 *    must fail loudly instead of publishing text on someone else's site.
 *
 *  - ON DELETE CASCADE, not restrict. "Restrict" exists so deleting a tenant can never silently
 *    wipe bookings and payments. This row is disposable public copy with no financial or personal
 *    data, so it goes with its tenant - which also means tenant hard-delete keeps working without
 *    this table having to be added to its hand-maintained table list.
 *
 * Row-level security is enabled in the migration (same tenant_isolation policy as the others).
 */
export const tenantSiteContent = pgTable(
  "tenant_site_content",
  {
    id: idColumn(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** Partial SiteContent document: only what the tenant has overridden. Defaults are applied at read time. */
    content: jsonb("content").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    updatedByUserId: uuid("updated_by_user_id").references(() => users.id, { onDelete: "set null" }),
    ...timestampColumns,
  },
  (table) => ({
    tenantUnique: uniqueIndex("tenant_site_content_tenant_unique").on(table.tenantId),
  })
);
