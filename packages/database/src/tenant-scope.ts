import { and, eq, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";

/**
 * Combines a tenant_id equality check with any number of additional
 * conditions. Every repository query against a tenant-owned table should
 * build its WHERE clause through this rather than hand-writing
 * `eq(table.tenantId, tenantId)` inline - one choke point that can't be
 * typo'd or forgotten is what makes "every query is tenant-scoped" an
 * enforceable property of the codebase instead of a convention someone
 * has to remember on every new repository method.
 *
 * Repositories are process-lifetime singletons (constructed once at
 * service boot - see each service's index.ts), while tenantId is a
 * per-request value resolved by @travel/http's tenantContext middleware.
 * That's *why* this is a plain function taking tenantId as an argument
 * rather than a tenantId baked into a repository instance: a singleton
 * repository can't hold per-request state.
 *
 * Usage:
 *   .where(withTenant(schema.bookings.tenantId, tenantId, eq(schema.bookings.status, "confirmed")))
 */
export function withTenant(tenantColumn: PgColumn, tenantId: string, ...conditions: Array<SQL | undefined>): SQL {
  const combined = and(eq(tenantColumn, tenantId), ...conditions);
  // `and()` only returns undefined when given zero defined conditions, which
  // can't happen here since eq(tenantColumn, tenantId) is always present -
  // this non-null assertion is safe, not a shortcut around a real gap.
  return combined!;
}

/**
 * Stamps tenantId onto an insert payload. A thin wrapper, but a
 * deliberate one: `scopedInsert(tenantId, input)` at every insert call
 * site makes "did this insert get a tenantId" grep-able and impossible to
 * silently miss the same way a bare `{ ...input, tenantId }` spread is
 * easy to typo or leave out under a diff.
 */
export function scopedInsert<T extends Record<string, unknown>>(tenantId: string, values: T): T & { tenantId: string } {
  return { ...values, tenantId };
}
