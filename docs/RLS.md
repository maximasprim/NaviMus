# Tenant isolation: row-level security

Tenant isolation is enforced in **two independent layers**:

1. **Application layer** - every repository query is scoped with `withTenant(...)` / `scopedInsert(...)`.
2. **Database layer (this document)** - Postgres row-level security (RLS) policies make a query *physically unable* to see or write another tenant's rows, even if layer 1 has a bug.

Layer 2 exists so that "someone forgot a `WHERE tenant_id = ...`" becomes a non-event instead of a data breach.

## How it works

```
request ──► tenantContext (resolve tenant) ──► BEGIN
                                               set_config('app.current_tenant_id', <tenant>, true)   -- transaction-local
                                               ... handler + all repositories ...
                                             COMMIT
```

- `packages/database/src/rls-context.ts` holds the mechanism. `createDb()` returns a thin proxy; inside a context (an `AsyncLocalStorage`), every query is transparently routed to that request's transaction. Repositories are unchanged and cannot forget the context.
- `set_config(..., true)` is **transaction-local**, so a pooled connection can never carry one request's tenant into the next.
- Policies (migration `0002_row_level_security.sql`) compare `tenant_id` to `app_current_tenant()`, or let everything through when `app_rls_bypass()` is true.
- A session that never declared a tenant sees **nothing** (fails closed).

### Three kinds of policy

| Kind | Tables | Rule |
|---|---|---|
| Direct | anything with its own `tenant_id` (`bookings`, `payments`, `travelers`, ...) | `tenant_id = current tenant` |
| Inherited | child tables (`booking_items`, `ledger_entries`, `rooms`, ...) | visible iff the parent row is visible (composes through multi-level chains) |
| Special | `tenants` (anyone reads, only own row writes), `system_settings` (tenants read platform defaults, write only their own) | see migration comments |

Deliberately **not** covered: shared reference data (`plans`, `permissions`, `roles`, `countries`, `regions`, `cities`), `payment_webhooks` (looked up before the tenant is known), `search_logs` (anonymous analytics).

## The role you connect as matters (read this)

RLS **does not apply** to superusers, to roles with `BYPASSRLS`, or to a table's owner. Supabase's default `postgres` role has `BYPASSRLS`. Connect as it, and RLS is switched on but protects nothing.

So there are two database roles:

| Role | Used for | Env var |
|---|---|---|
| Owner (e.g. `postgres`) | `db:migrate`, `db:seed`, `db:setup-app-role` | `DATABASE_MIGRATION_URL` |
| `travel_app` (NOLOGIN until you set a password; no superuser, no BYPASSRLS, no DDL) | the running API and workers | `DATABASE_URL` |

On boot the gateway runs `checkRlsEnforcement()`. In production, if the connected role would bypass RLS, **the process exits** (set `REQUIRE_RLS=false` only as a deliberate, temporary escape hatch). In development it logs a warning.

## Production setup

```bash
# 1. migrate as the owner
DATABASE_MIGRATION_URL=postgresql://postgres:...@host/db  pnpm db:migrate

# 2. give travel_app a login password (also how you rotate it)
APP_DB_PASSWORD='<strong secret from your secret manager>' \
DATABASE_MIGRATION_URL=postgresql://postgres:...@host/db \
  pnpm --filter @travel/database db:setup-app-role

# 3. point the app at travel_app
DATABASE_URL=postgresql://travel_app:<APP_DB_PASSWORD>@host/db
DATABASE_MIGRATION_URL=<owner url, used only by migrate/seed>
```

With a pooler (Supabase/pgBouncer) use **transaction mode** or session mode; both are fine because nothing relies on session state - settings are transaction-local.

## Development

`docker compose -f docker-compose.dev.yml up` creates `travel_app` with a throwaway dev password (`infrastructure/docker/postgres-init/01-dev-app-role.sql`), and the compose services connect as it. From the host:

```bash
DATABASE_URL=postgres://travel_app:travel_app_dev_password@localhost:5432/travel_platform
DATABASE_MIGRATION_URL=postgres://postgres:postgres@localhost:5432/travel_platform
pnpm db:migrate && pnpm db:seed          # these use the owner URL
```

## Writing code that works with RLS

- **Normal request code:** do nothing. The gateway has already established the tenant context.
- **Code with no tenant (system jobs, platform admin, signup, webhooks):** call `runInBypassContext(db, fn)` / `withPlatformRLSBypass`. This performs **no authorization** - call it only after the caller is authorised, and keep the block as small as possible (e.g. the webhook payment lookup, the reaper's sweep).
- **Event consumers:** `subscribe()` already runs each handler in its event's tenant context; an event without `tenantId` fails the job.
- **A new tenant-scoped table:** give it a `tenant_id` (via `tenantIdColumn()`) **and add it to the policy list in a new migration**; or, for a pure child table, add a `child|fk|parent` entry. A table with no policy is *not protected*.
- **Don't catch-and-continue a failed statement** inside a request. A failed statement aborts the whole transaction in Postgres. Wrap deliberately-failing statements in a savepoint (`db.transaction(...)`).
- **Connections:** each request holds one connection for its duration. Size `DB_POOL_MAX` to your concurrency; background workers use their own small pool (`EVENTS_DB_POOL_MAX`).

## Verifying

```bash
RLS_TEST_ADMIN_URL=<owner url> RLS_TEST_APP_URL=<travel_app url> \
  pnpm --filter @travel/database test
```

The suite connects as `travel_app` and proves: no context sees nothing; tenant A never sees B across every policy shape; cross-tenant inserts/updates/deletes are blocked; a nested bypass block doesn't leave RLS off; settings never leak across pooled connections; concurrent tenants never cross. It skips (rather than fails) when the URLs are absent. CI runs it against a scratch Postgres.

## Known limits

- RLS is a safety net against **application bugs**, not against SQL injection: an attacker who can run arbitrary SQL as `travel_app` can set `app.bypass_tenant_rls` themselves. Keep using parameterised queries.
- Guest `notification_logs` rows written before migration `0003` have no tenant information and were assigned to the default tenant.
- `search_logs` and `payment_webhooks` are not tenant-isolated (see above).
