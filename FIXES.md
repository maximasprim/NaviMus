# What changed in this release

Every item from the original review, plus problems found while fixing them. Each fix has tests; see the verification notes at the end.

## You must do these yourself (code can't)

1. **Rotate every secret that was in the archive you sent.** It contained a working `.env` and three `apps/*/.env.local` files with the **Supabase service-role key, the Postgres password, the JWT secrets and the encryption key**. They have been removed from this release, but anything that was ever in a zip, a chat or a repo must be treated as leaked: change the database password, regenerate the Supabase service-role key, and issue new JWT/encryption secrets (`pnpm secrets:generate`). If the original was ever committed, also purge it from git history.
   - Rotating `ENCRYPTION_KEY` makes stored passport numbers unreadable **unless** you follow the rotation procedure: put the old key in `ENCRYPTION_KEY_PREVIOUS`, deploy, run `pnpm --filter @travel/service-account reencrypt -- --apply`, then remove it.
2. **Create the `travel_app` database role's password and point `DATABASE_URL` at it** (otherwise row-level security protects nothing, and the API will refuse to start in production). See `docs/RLS.md#production-setup`.
3. **Run the migrations** (`0001`-`0005`) as the owner role. Note the notification-log backfill limitation in `docs/RLS.md`.
4. If you use them: configure Stripe plan billing (`docs/BILLING.md`), M-Pesa callback secrets and initiator credentials (`.env.example`), and `API_INTERNAL_URL` for each Next app.
5. **Test M-Pesa refunds in the Daraja sandbox and Stripe Checkout/Portal in Stripe test mode once** - these were verified with fakes and against a real database, but not against the providers' live APIs.
6. Users will be **signed out once** on deploy (sessions moved from localStorage tokens to tracked cookie sessions; old stateless refresh tokens are not honoured).

## Fixes

### Security
| Problem | Fix |
|---|---|
| **M-Pesa webhook could be forged** - no authentication, amount trusted | Per-payment HMAC-signed callback URL, optional IP allowlist, server-side Daraja STK query before crediting, amount/currency/payment-binding checks. The old unauthenticated route is gone. |
| Secrets committed in the archive | Removed; templates only; `.gitignore` hardened; gitleaks in CI; secret generator; encryption-key rotation support. |
| Tenant isolation relied only on every query remembering `tenant_id` | Postgres RLS on 65 of 75 tables (67 policies; the rest are shared reference data), driven per request; `travelers`/`favorites`/`notification_logs` got their own `tenant_id`; boot guard refuses a role that bypasses RLS; one shared connection pool instead of up to 150 connections. |
| Session tokens in `localStorage` (XSS = account takeover) | httpOnly cookies via a same-origin proxy; CSRF header; CORS allowlist, never credentialed. |
| Refresh tokens stateless: logout ended nothing, stolen token valid 30 days, deactivated users kept sessions, password reset kept sessions | Server-tracked refresh tokens with rotation, reuse detection (family revoke), multi-tab grace window, status check, revoke on logout / password reset. Admin and partner apps gained a Sign out button (they had none). |
| JSON-LD built with `JSON.stringify` (`</script>` in an operator-authored title = stored XSS) | `safeJsonLd` escaping, tested with hostile input. |
| CORS: production `[]` (everything blocked), dev `*` + credentials (invalid) | Explicit allowlist with safe subdomain wildcards. |

### Money correctness
| Problem | Fix |
|---|---|
| Webhook retry after a crash was dropped as a "duplicate" - paid customers never confirmed | Dedup only counts fully processed events; payment/booking rows locked `FOR UPDATE`. |
| M-Pesa callback URL hardcoded to example domains | Built from `PUBLIC_API_URL`. |
| M-Pesa charged KES for non-KES bookings (USD 500 → KES 500) | Refused for non-KES. |
| Any non-payment Stripe event could fail a booking, or crash the handler | Unknown events are ignored cleanly. |
| Refunds: ledger posted and "completed" event sent while the provider said *pending*; no lock (double refund possible); provider errors left dangling rows; M-Pesa refunds threw | Proper state machine; M-Pesa Transaction Reversal with signed result/timeout callbacks; Stripe `refund.updated` handling; concurrent refunds refused. M-Pesa reversals are full-amount only. |
| No way for tenants to pay for / change a plan | Stripe Checkout + Billing Portal with verified, deduplicated, order-safe webhooks (`docs/BILLING.md`). |
| Customers couldn't cancel an unpaid booking (409) | Fixed; no refund computed for bookings that were never paid. |

### Platform
- `system_settings` platform defaults (e.g. commission %) stay readable to tenants under RLS.
- Event consumers and the stale-hold reaper run with correct tenant / system context.
- `pnpm db:generate` repaired; hidden dependency of tests on a developer's `.env` removed.
- Dev docker now exercises RLS (creates the app role).
- README rewritten (old one archived: `docs/archive/BUILD_NOTES.md`); `.github/workflows/integration.yml` added alongside (not replacing) any existing workflows.

## Database migrations (in order)

`0001` travelers/favorites `tenant_id` (+ backfill) · `0002` row-level security + `travel_app` role · `0003` `notification_logs.tenant_id` (+ backfill) · `0004` SaaS billing columns/tables, receipt number · `0005` refresh-token tracking.

## Verification

Run in a sandbox with a real Postgres 16-compatible server and Redis (not mocks):

- **283 unit/integration tests** across 15 packages pass, including RLS isolation tests run as the unprivileged role, refund and billing state machines against the real database, and concurrency cases (double refund, duplicate webhooks, concurrent refresh).
- **27 end-to-end tests** through the real gateway as `travel_app`, including the full cookie-session lifecycle and a refresh-token theft scenario.
- The Next.js same-origin proxy was driven through a real `next dev` server (login, cookie, CSRF, refresh, logout).
- Security tests were **mutation-checked**: deliberately breaking the signature check, the Daraja confirmation, the RLS bypass, the refund guards and theft detection each made tests fail.
- Not verifiable here: live Stripe/Daraja API calls, Next.js production builds (blocked by the sandbox's Google Fonts access - the code typechecks and runs under `next dev`), and the GitHub Actions workflow itself (its commands were rehearsed locally).
