# NaviMus - multi-tenant tours & travels platform

A white-label SaaS: many tour businesses ("tenants") each run their own branded travel marketplace on one deployment - catalogue, bookings, payments, operators, reviews, promotions, notifications - and pay the platform for a plan.

TypeScript monorepo (pnpm): a Hono API gateway mounting 15 domain services over one Postgres (Drizzle ORM) with Redis/BullMQ for events, and three Next.js apps.

```
apps/
  api-gateway/      Hono gateway: tenant resolution, RLS context, CORS, rate limits, mounts every service
  web/              customer storefront (SEO, search, booking, account)
  admin/            platform + tenant admin console
  partner-portal/   tour-operator portal
services/           auth, destinations, packages, bookings, payments, accommodation, transport,
                    transfers, reviews, promotions, operators, admin (tenants/billing), media,
                    notifications (+ worker), account
packages/           database (schema, migrations, RLS), auth, http, config, types, validation,
                    events, currency, maps, logger
tests/e2e/          end-to-end suite against a running gateway
docs/               RLS.md, BILLING.md (operations guides) and archive/
```

## Quick start

Prerequisites: Node 20+, pnpm 9, Docker.

```bash
cp .env.example .env                      # then: pnpm secrets:generate  and paste the values in
docker compose -f docker-compose.dev.yml up -d postgres redis
pnpm install

# migrate + seed as the OWNER role; the API itself runs as the low-privilege travel_app role
export DATABASE_MIGRATION_URL=postgres://postgres:postgres@localhost:5432/travel_platform
export DATABASE_URL=postgres://travel_app:travel_app_dev_password@localhost:5432/travel_platform
pnpm db:migrate && pnpm db:seed

pnpm dev:gateway          # http://localhost:4000
pnpm dev:notifications    # the event worker (a separate process)
pnpm dev:web              # http://localhost:3000   (also dev:admin, dev:partner-portal)
```

Each Next app needs a `.env.local` - copy `.env.local.example` (browser-visible values only, never secrets).
The seed creates two demo tenants (`default`, `acme-travel-demo`) and demo users (listed in the seed's output), all with the demo password `Test-Passw0rd!`. **Never run the seed against a production database.**

## How the important things work

| Concern | Approach | Details |
|---|---|---|
| **Tenant isolation** | App-layer scoping *and* Postgres row-level security, enforced per request via a transaction-local tenant setting; the API refuses to boot in production if its DB role could bypass RLS | [docs/RLS.md](docs/RLS.md) |
| **Sessions** | httpOnly cookies for browsers (via a same-origin `/api/v1` proxy in each Next app); Bearer tokens for API clients. Refresh tokens are tracked server-side: rotated on use, family-revoked on reuse, revoked on logout and password reset | `packages/auth/src/cookies.ts`, `services/auth` |
| **CSRF** | SameSite=Lax + a required `X-Requested-With` header on cookie-authenticated writes; CORS is an explicit allowlist and never credentialed | `packages/http/src/cors.ts` |
| **Customer payments** | M-Pesa (STK push) and Stripe behind one provider interface. Money is only recorded from authenticated provider callbacks (signed callback URLs + server-side Daraja confirmation for M-Pesa; Stripe signatures), checked against the amount/currency we asked for | `services/payments` |
| **Refunds** | A real state machine: row-locked claim → provider → settled only when the provider confirms; async providers settle via signed callback / `refund.updated` | `services/payments/src/services/payment-service.ts` |
| **Plan billing** | Stripe Checkout + Billing Portal; plan changes driven only by verified, deduplicated, order-safe webhooks | [docs/BILLING.md](docs/BILLING.md) |
| **Secrets** | Nothing secret in git or in the browser; encryption-key rotation supported | `.env.example`, `pnpm secrets:generate` |

## Design rules that are enforced, not just described

- **No client-trusted pricing or payment status.** Prices are computed server-side; a payment's status only changes from an authenticated provider event.
- **Booking state machine is an allow-list** (`BOOKING_STATUS_TRANSITIONS`), consulted on every status write.
- **Idempotency** is a unique database constraint on `bookings.idempotency_key` / `payments.idempotency_key`.
- **Append-only money records by convention:** `ledger_entries` and `booking_status_history` are only ever inserted into by the code (corrections are new rows). This is not yet enforced by database permissions.
- **No sequential public IDs** - every primary key is a UUID.
- **RBAC is server-side** (`requirePermissions` / `requireRoles` from the verified token).
- **One response envelope** (`{success, data}` / `{success:false, error, requestId}`); no stack traces or DB errors reach clients.

## Testing

```bash
pnpm typecheck
pnpm test            # unit tests; database-backed suites skip themselves without the env below
```

The database-backed suites (RLS isolation, billing, refunds) and the end-to-end suite need a migrated, seeded Postgres and the `travel_app` role:

```bash
export RLS_TEST_ADMIN_URL=<owner url>   RLS_TEST_APP_URL=<travel_app url>
DATABASE_URL=$RLS_TEST_APP_URL pnpm test                 # + integration suites
pnpm dev:gateway & pnpm dev:notifications &              # as travel_app
pnpm test:e2e                                            # needs a running gateway
```

The `Integration & security` workflow (`.github/workflows/integration.yml`) runs all of that against real Postgres 16 + Redis 7, including a check that the production gateway refuses to start with an RLS-bypassing role, plus a gitleaks secret scan.

## Deploying

1. Provision Postgres, Redis, and an object store for media.
2. Generate fresh secrets (`pnpm secrets:generate`); set them in your host's secret manager - never in git.
3. Migrate as the owner role, then create the app role's login: [docs/RLS.md](docs/RLS.md#production-setup). **Point `DATABASE_URL` at `travel_app`.**
4. Set `PUBLIC_API_URL`, `ADMIN_APP_URL`, and (if you take card/M-Pesa payments or sell plans) the provider variables listed in `.env.example`; follow [docs/BILLING.md](docs/BILLING.md) for Stripe plan billing.
5. Run the gateway and the notifications worker as separate processes; give each Next app `API_INTERNAL_URL` (server-side).

Deploy pipelines are hosting-specific and are not part of this change; keep whatever workflows you already have under `.github/workflows/` - `integration.yml` is additive.

## Known limitations

- **M-Pesa reversals (refunds) and Stripe Checkout/Portal session creation have not been exercised against the providers' live/sandbox APIs** - they are covered by unit tests with fakes and, for refunds and billing state, by database integration tests. Run each once in provider sandbox/test mode before going live.
- M-Pesa reversals are full-amount only; partial M-Pesa refunds must be done manually.
- A pending M-Pesa payment whose callback never arrives is not reconciled automatically (Daraja callbacks are best-effort); there is no polling job.
- Each request holds one DB connection for its duration (including payment-provider calls): size `DB_POOL_MAX` accordingly.
- `search_logs` and `payment_webhooks` are not tenant-isolated (see docs/RLS.md).
- No dunning emails for failed plan payments (a banner is shown; configure Stripe's emails).

Historical build notes: [docs/archive/BUILD_NOTES.md](docs/archive/BUILD_NOTES.md).
