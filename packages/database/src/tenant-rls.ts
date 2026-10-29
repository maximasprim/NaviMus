import type { Database } from "./client.js";
import { rlsStorage, runInBypassContext, runInTenantContext } from "./rls-context.js";

/**
 * Runs `callback` inside a transaction with `app.current_tenant_id` set
 * for that transaction ONLY, via `set_config(..., is_local => true)` -
 * the parameterizable equivalent of `SET LOCAL`. The row-level security
 * policies in migration 0002_row_level_security.sql read this setting and restrict
 * every query on the connection to rows matching it, as a second,
 * database-enforced layer underneath this codebase's existing
 * application-layer scoping (withTenant, requireAuth's tenant check,
 * etc.) - a defense that holds even if some future repository method
 * forgets to filter by tenant itself.
 *
 * This MUST run inside a transaction, never as a bare `SET` on the
 * shared connection pool: drizzle's `db.transaction()` reserves one
 * physical connection for its duration (confirmed - it calls
 * postgres.js's own `sql.begin()`), so the setting can never leak
 * forward into a later, unrelated request that happens to reuse the
 * same pooled connection. A bare `SET` outside a transaction would be a
 * real cross-tenant data leak, not a theoretical one, the moment two
 * different tenants' requests happened to share a connection from the
 * pool - which they will, under any real load.
 *
 * Callers get `tx` (a Database bound to that one transactional
 * connection) and must do all their tenant-scoped work through it, not
 * through the original `db` - using `db` instead would run outside the
 * transaction, on a possibly-different connection with no session
 * variable set, and RLS would then correctly return zero rows.
 */
export async function withTenantRLS<T>(db: Database, tenantId: string, callback: (tx: Database) => Promise<T>): Promise<T> {
  // Delegates to the ambient-context runner so that (a) nesting inside a
  // request's own context becomes a savepoint with settings restored
  // afterwards, and (b) repositories called inside `callback` without an
  // explicit tx are confined to the tenant too.
  return runInTenantContext(db, tenantId, () => callback(rlsStorage.getStore()!.tx as Database));
}

/**
 * The one legitimate way to run genuinely cross-tenant queries once RLS
 * is enabled - the platform's own super_admin endpoints (tenant
 * management, cross-tenant dashboards) and system jobs that must scan
 * across every tenant (the expired-booking-hold reaper). Sets
 * `app.bypass_tenant_rls`, which migration 0002_row_level_security.sql's policies
 * explicitly check for, rather than granting the app's DB role
 * BYPASSRLS outright - that would disable RLS for every query the app
 * makes, including ordinary tenant-scoped ones, defeating the entire
 * point. Call this only from code that has already independently
 * verified the caller is allowed to act across tenants (e.g. the
 * super_admin role check in requireAuth) - this helper itself performs
 * no authorization, it only flips the database-level switch once the
 * application has decided it's warranted.
 */
export async function withPlatformRLSBypass<T>(db: Database, callback: (tx: Database) => Promise<T>): Promise<T> {
  return runInBypassContext(db, () => callback(rlsStorage.getStore()!.tx as Database));
}
