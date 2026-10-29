import { AsyncLocalStorage } from "node:async_hooks";
import { sql } from "drizzle-orm";

/**
 * Ambient database context for row-level security.
 *
 * Problem: Postgres RLS needs `app.current_tenant_id` set on the SAME
 * connection that runs each query, inside a transaction (so it can never
 * leak to the next request that reuses a pooled connection). The code base
 * has ~20 repositories that each call `this.db.select()...` directly, and
 * threading an explicit `tx` through every one would be a huge, error-prone
 * diff.
 *
 * Solution: the object `createDb()` returns is a thin Proxy. Outside any
 * context it behaves exactly like a normal drizzle instance. Inside
 * `runInTenantContext` / `runInBypassContext` (AsyncLocalStorage), every
 * property access is transparently redirected to that context's open
 * transaction, whose tenant setting was already applied. Repositories are
 * unchanged, and - crucially - cannot forget the context.
 *
 * Nesting is safe: `db.transaction()` inside a context becomes a SAVEPOINT
 * on the same connection (drizzle supports nested transactions), which is
 * why explicit `withTenantRLS` blocks in existing code keep working.
 */

interface RlsContext {
  tx: any;
  mode: "tenant" | "bypass";
  tenantId?: string;
}

export const rlsStorage = new AsyncLocalStorage<RlsContext>();

/** Symbol under which the proxy exposes the underlying, un-redirected drizzle instance. */
export const RAW_DB = Symbol.for("travel.rawDb");

export function wrapWithRlsContext<T extends object>(db: T): T {
  return new Proxy(db, {
    get(target, prop) {
      if (prop === RAW_DB) return target;
      const active: any = rlsStorage.getStore()?.tx ?? target;
      const value = active[prop];
      return typeof value === "function" ? value.bind(active) : value;
    },
  });
}

function rawOf(db: any): any {
  return db[RAW_DB] ?? db;
}

/** True while running inside runInTenantContext / runInBypassContext. */
export function currentRlsMode(): "tenant" | "bypass" | null {
  return rlsStorage.getStore()?.mode ?? null;
}

async function applySettings(tx: any, settings: { tenantId?: string; bypass: boolean }) {
  await tx.execute(
    sql`select set_config('app.current_tenant_id', ${settings.tenantId ?? ""}, true),
               set_config('app.bypass_tenant_rls', ${settings.bypass ? "true" : "false"}, true)`
  );
}

/**
 * Runs `fn` with every database access (through any createDb() handle)
 * confined to `tenantId` by Postgres itself. If a context is already
 * active, nests as a savepoint on the same connection instead of opening a
 * second one (which could deadlock the pool).
 */
export async function runInTenantContext<T>(db: any, tenantId: string, fn: () => Promise<T>): Promise<T> {
  return runWithSettings(db, { mode: "tenant", tenantId, bypass: false }, fn);
}

/**
 * Cross-tenant access for the platform's own authorised paths (super_admin
 * endpoints, tenant provisioning, webhook-to-tenant resolution, system
 * jobs). Performs NO authorization itself - call it only after the caller
 * has been authorised to act across tenants.
 */
export async function runInBypassContext<T>(db: any, fn: () => Promise<T>): Promise<T> {
  return runWithSettings(db, { mode: "bypass", bypass: true }, fn);
}

async function runWithSettings<T>(
  db: any,
  s: { mode: "tenant" | "bypass"; tenantId?: string; bypass: boolean },
  fn: () => Promise<T>
): Promise<T> {
  const outer = rlsStorage.getStore();
  // Nested: reuse the open connection via a savepoint, and RESTORE the
  // outer settings afterwards. SET LOCAL lasts until the end of the whole
  // transaction, not the savepoint - without restoring, a bypass block
  // nested in a tenant request would leave the rest of that request
  // running with RLS switched off.
  const starter = outer ? outer.tx : rawOf(db);
  return starter.transaction(async (tx: any) => {
    await applySettings(tx, s);
    try {
      return await rlsStorage.run({ tx, mode: s.mode, tenantId: s.tenantId }, fn);
    } finally {
      if (outer) {
        await applySettings(tx, { tenantId: outer.tenantId, bypass: outer.mode === "bypass" }).catch(() => {
          /* If the transaction is already aborted, the savepoint rollback restores settings anyway. */
        });
      }
    }
  });
}

export interface RlsEnforcementReport {
  enforced: boolean;
  problems: string[];
}

/**
 * Verifies that THIS connection's role is actually subject to the RLS
 * policies. RLS silently does nothing for superusers, for roles with
 * BYPASSRLS (Supabase's default `postgres` role has it), and for a table
 * owner unless FORCE ROW LEVEL SECURITY is set. Without this check,
 * enabling RLS can look done while protecting nothing - the exact failure
 * mode this exists to catch at boot.
 */
export async function checkRlsEnforcement(db: any): Promise<RlsEnforcementReport> {
  const problems: string[] = [];
  const rows: any[] = await rawOf(db).execute(sql`
    select r.rolname, r.rolsuper, r.rolbypassrls,
           c.relrowsecurity as rls_on, c.relforcerowsecurity as rls_forced,
           pg_get_userbyid(c.relowner) = current_user as is_owner
    from pg_roles r, pg_class c
    where r.rolname = current_user and c.oid = 'public.bookings'::regclass
  `);
  const row = rows[0];
  if (!row) return { enforced: false, problems: ["could not inspect role/table (is the schema migrated?)"] };
  if (!row.rls_on) problems.push("row-level security is not enabled on public.bookings (run migrations)");
  if (row.rolsuper) problems.push(`role "${row.rolname}" is a superuser and bypasses RLS`);
  if (row.rolbypassrls) problems.push(`role "${row.rolname}" has BYPASSRLS and ignores RLS policies`);
  if (row.is_owner && !row.rls_forced) problems.push(`role "${row.rolname}" owns the tables and FORCE ROW LEVEL SECURITY is off`);
  return { enforced: problems.length === 0, problems };
}
