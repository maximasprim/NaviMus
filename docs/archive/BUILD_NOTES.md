> **ARCHIVED - historical build notes, partly out of date.** This is the original per-pass README. It predates multi-tenancy hardening, row-level security, SaaS billing, cookie sessions and the CI pipeline, and some statements (for example "no package registry access", "never run") are no longer true. The current README is [../../README.md](../../README.md). Kept for its detailed feature inventory.

# Travel Platform - Monorepo

A commercial-grade tours & travel marketplace. See the accompanying architecture
document (System/Service/Database/API/Booking/Payment/Notification/Security
Architecture) for full design rationale. This README covers what's implemented
and how to run it.

## What's implemented (Phase 1 + Phase 2)

**Shared packages** (`packages/`)
- `config` - Zod-validated environment loader; fails fast on missing/invalid config.
- `logger` - Pino structured logging with automatic secret redaction.
- `types` - booking/payment status enums, the **enforced booking state-machine
  transition table**, typed `AppError` hierarchy, standard API envelope types.
- `validation` - shared Zod schemas (auth, destinations, bookings) used by both
  backend routes and (eventually) the frontend forms.
- `auth` - JWT sign/verify, Argon2id password hashing, Hono RBAC middleware.
- `http` - response envelope helpers, request-ID propagation, centralized error
  handler, Redis-backed rate limiter.
- `database` - full Drizzle ORM schema across every domain in the spec (identity/
  RBAC, geography, operators, destinations, accommodation, transport, transfers,
  cancellation policies, packages, bookings, payments/ledger, reviews, promotions,
  notifications, invoices, audit/support/misc), a db client factory, a migration
  runner, and a seed script with demo Kenya/Tanzania data.

**Services** (`services/`)
- `auth` - register / login / refresh / me, layered as routes → service → repository.
- `destinations` - search, get-by-slug, category list, and admin CRUD gated by
  RBAC permissions.
- `packages` - search, get-by-slug (with destinations/itinerary/prices attached),
  availability read/write, and the **server-side price quote engine**
  (`calculatePackageQuote`) that is the single source of truth for pricing.
  Also exposes an `internal.ts` subpath (`@travel/service-packages/internal`)
  so the Booking service can reuse its `AvailabilityRepository` and pricing
  logic inside a shared transaction - see the note in that file about what
  changes when Packages is extracted to its own deployment.
- `bookings` - the core commercial loop: `createBooking` (idempotent, computes
  price server-side, reserves inventory and creates the booking in one DB
  transaction), `cancelBooking` (resolves the applicable cancellation rule,
  computes refund/penalty, releases inventory), and a stale-hold reaper.
  The booking status machine (`state-machine.ts`) is the only code path
  allowed to write `bookings.status`, and it always pairs a status change
  with a `booking_status_history` row in the same transaction. Exposes
  `@travel/service-bookings/internal` (the state-machine function and
  repository) for the Payment service to call inside a shared transaction.
- `payments` - the M-Pesa/Stripe abstraction (`PaymentProvider` interface,
  never referenced directly by business logic - only through
  `getPaymentProvider(name)`), `createIntent` (idempotent per booking),
  `handleWebhook` (the **only** path that can confirm a booking - signature-
  verified, deduplicated via the `payment_webhooks` unique constraint,
  splits a successful payment into `customer_payment` /
  `platform_fee` / `operator_earning` ledger entries using each operator's
  configurable commission rate), and `refund` (posts a ledger entry only
  after the provider confirms money actually moved).
- The remaining service folders - see `reviews` and `promotions` below,
  which are fully built, not stubs.

**`services/accommodation`** - property/room-type CRUD, plus the nightly-
overlap availability check: `getOverlappingBookedRooms` sums `rooms_booked`
across any `accommodation_bookings` row whose date range overlaps the
requested stay (row-locked with `FOR UPDATE`), so two concurrent bookings
for the last room on overlapping nights can't both succeed.

**`services/transport`** - route/vehicle CRUD plus per-vehicle, per-date seat
capacity checks (same row-locked overlap pattern, simpler since transport
capacity is per single date rather than a date range).

**`services/transfers`** - airport/location and transfer CRUD plus booking;
transfers don't have a hard pooled-capacity ceiling in this scaffold (an
operator assigns a driver/vehicle afterward), so reservation here just
records the line item and price.

All three expose an `internal.ts` subpath (same shared-database pattern as
Packages/Bookings) so the Booking service can reserve a room, a transport
seat, and a transfer **in the same checkout transaction** as the package
seats - `createBooking` now accepts `transportOptionId`,
`accommodationRoomTypeId`, and `airportTransferId` and, if provided, prices
and reserves each one, adds it to `booking_items`, and rolls the whole
booking back if any single piece is unavailable. (Simplification flagged in
the code: these option IDs currently map directly to `transport_routes` /
`room_types` rather than being validated against
`package_transport_options` / `package_accommodation_options` first - real
hardening for Phase 8.)

**`packages/events`** - the shared domain-event layer described in the
Events Architecture. `DomainEventMap` in `contracts.ts` is the single typed
source of truth for every event payload shape; `EventPublisher.publish()`
(BullMQ, one queue per event name) is called by Booking/Payment services
**after** their transactions commit, never from inside them, so a queue
hiccup can never roll back a booking that actually succeeded.

**`services/notifications`** - subscribes to `booking.created`,
`payment.completed`, `payment.failed`, `booking.cancelled`, and
`refund.completed`; resolves the matching `notification_templates` row,
renders `{{variable}}` placeholders, and sends through a swappable
`ChannelProvider` (mock by default; real `ResendEmailProvider` and
`AfricasTalkingSmsProvider` implementations included, selected via
`EMAIL_PROVIDER`/`SMS_PROVIDER` env config). Every send is logged to
`notification_logs` regardless of outcome. Runs as a separate worker
process (`worker.ts`, via `Dockerfile.worker`) - the service's `index.ts`
only exposes `/health` for orchestration, since the real work is queue-
driven, not request-driven.

**Gateway** (`apps/api-gateway`) - mounts `auth`, `destinations`, `packages`,
`bookings`, and `payments` under `/api/v1/<domain>`, with global CORS,
security headers, request-ID propagation, Redis-backed rate limiting, and
centralized error handling. This is also the extraction seam: swapping a
`.route()` mount for an HTTP proxy call later moves a service to its own
deployment without changing the external API contract.

**Infra** - `docker-compose.dev.yml` (Postgres + Redis + gateway), a generic
parameterized `Dockerfile.service` for any workspace app/service, `.env.example`
documenting every config value from the spec.

**`services/operators`** - the Partner/Operator service that Packages,
Accommodation, and Transport had previously stubbed out (each had a `NOTE:`
comment using the caller's own user id as a stand-in operatorId). Now real:
registration, admin approval/rejection (with `operator.approved` /
`operator.rejected` domain events and matching email templates), staff
management, document submission/review, and - the important part -
`resolveOperatorForUser()`, which those three services now actually call via
`@travel/service-operators/internal` instead of trusting a client-supplied
or self-asserted operator id. Transport needed one extra hop (a
`transport_routes` row belongs to a `transport_providers` row, not directly
to an operator), handled by `findOrCreateProviderForOperator`. Transfers is
intentionally excluded - airport transfers are platform-managed in the
current schema, not operator-owned.

This closed the gap flagged in the previous pass: `ReviewService.respond()`
now resolves the reviewed subject's owning operator (`package` →
`packages.operatorId`, `accommodation` → `accommodations.operatorId`,
`transport` → `transportProviders.operatorId`) and rejects a `tour_operator`
caller who doesn't match it - role-gating alone ("is this any operator")
was never sufficient, it needed ownership-gating ("is this *this*
operator's listing"). `admin`/`super_admin`/`customer_support` bypass the
check entirely, since they're not expected to hold an operator account.
Subject types with no operator ownership in the schema (`destination`,
`tour_guide`, `airport_transfer`) reject any non-admin responder outright,
without even calling `resolveOperatorId`. Covered by
`review-service.test.ts`.

## Audit pass (this turn)

Rather than add more surface, this pass traced actual deployment paths and
found three real bugs:

- **The stale-hold reaper never ran under the documented default dev setup.**
  It was gated behind a "run only when this file is the process entry
  point" check, but `pnpm dev:gateway` (the documented default) imports
  every service's `app` export into one process rather than running
  `services/bookings` standalone - so that check was always false, and
  abandoned `PENDING_PAYMENT` bookings would hold inventory forever. Fixed
  by making the reaper's `setInterval` unconditional (it's safe to run
  redundantly across processes) while keeping the HTTP listener itself
  gated, since two `serve()` calls in one process would conflict.
- **`docker-build.yml`'s matrix was missing `operators`, `admin`, and
  `media`** - services added after the workflow was first written. Fixed.
- **The Next.js Dockerfile gap flagged in an earlier pass was fixed for
  real** instead of staying a permanent CI warning: all three Next.js apps
  now build with `output: "standalone"`, and a proper
  `Dockerfile.nextjs` replaces the generic `Dockerfile.service` for them.
  This also surfaced that none of the three apps had a `public/` directory
  yet, which would have failed the build's `COPY` step - added with
  `.gitkeep` placeholders.

## Follow-up pass: closed the remaining spec gaps

Everything below was flagged as missing in the previous "Not yet built"
section and has now been implemented, on top of the working state above
(nothing pre-existing was rewritten - only extended):

- **Booking option-ID validation hardening** (spec section 14, previously
  flagged as a Phase 8 TODO): `PackageRepository.findTransportOption()` /
  `findAccommodationOption()` now confirm a `transportOptionId`/
  `accommodationRoomTypeId` a client sends is actually one this specific
  package offers (via `package_transport_options`/
  `package_accommodation_options`) *before* `BookingService.createBooking`
  reserves anything against it - closing the gap where any valid transport
  route or room type ID, from any package, would previously have been
  accepted.
- **Search & filtering** (spec sections 23/24): `destinationSearchQuerySchema`
  and `packageSearchQuerySchema` already declared `q`, `country`, `region`,
  `city`, `minPrice`, `maxPrice`, `destinationId`, `travelers`, `startDate`/
  `endDate` - but `DestinationRepository.search()` / `PackageRepository.search()`
  silently ignored all of them beyond `category`/`type`/`featured`. Now
  implemented: ILIKE text search, geography joins (city → region → country)
  applied only for the levels actually supplied, price-range and
  availability-date-range filtering via `EXISTS` subqueries, and a
  `travelers`-vs-`maxGroupSize` check. (`minPrice`/`maxPrice` are
  intentionally left unapplied on the *destination* search - destinations
  have no price column; packages do.)
- **`packages/currency`** (spec section 18, multi-currency): new
  provider-abstracted package - `ExchangeRateProvider` interface,
  `StaticExchangeRateProvider` (checked-in fixed rate table, the default),
  `OpenExchangeRatesProvider` (real HTTP implementation), selected via
  `CURRENCY_PROVIDER`/`EXCHANGE_RATE_API_KEY`. Wired into
  `PackageService.getQuote()` as an **additive, non-authoritative**
  `display` field only - `quote.subtotal`/`quote.currency` (what a booking
  is actually created against) are never touched by it. See the doc
  comment on `ExchangeRateProvider` for why that separation is load-bearing,
  not incidental.
- **`packages/maps`** (spec section 43): new provider-abstracted package -
  `MapProvider` interface, a keyless `OpenStreetMapProvider` default (no
  API key required to have a working map), a real `GoogleMapsProvider`,
  and a provider-independent `calculateDistanceKm` (haversine) helper.
  Deliberately has no dependency on `@travel/config` (which would crash a
  browser bundle) - provider selection takes plain arguments instead, so
  it works from `apps/web` (`NEXT_PUBLIC_MAPS_*`) as well as any backend
  service. Wired into the destination detail page as an embedded map +
  directions link.
- **SEO** (spec section 38): `apps/web/app/sitemap.ts` and `robots.ts`
  (Next.js's built-in conventions - paginate the real catalog, degrade to
  static pages only if the API is unreachable rather than 500ing), plus
  per-page `generateMetadata` (title/description/canonical/OpenGraph) and
  JSON-LD structured data (`TouristTrip` on package pages, including an
  `Offer` when a price exists; `TouristDestination` with `GeoCoordinates`
  on destination pages) on both detail pages.
- **`deploy.yml`**: was a fully-TODO skeleton; the image build-and-push
  half is now real - every service/app image builds and pushes to GitHub
  Container Registry using the repo's built-in `GITHUB_TOKEN`, no external
  registry credentials needed. What's still an honest TODO, because no
  hosting target exists in this repo: applying those images to a live host,
  and running migrations against a real staging/production `DATABASE_URL`
  - both genuinely blocked on infrastructure secrets that don't exist yet,
  not something fillable without inventing them. (Caught and fixed a real
  bug in my own first draft of this file before finishing it: an early
  version made `deploy-production` depend on `deploy-staging`, which is
  *skipped* - not failed - on a direct production dispatch; a job needing a
  skipped job is itself skipped by default, which would have made
  production deploys silently never run. Fixed by depending on
  `build-and-push` only, with the ordering requirement left as an explicit
  comment instead.)

None of this has been run - same caveat as the rest of this README: no
`pnpm install` has happened in this environment, so this was checked by
tracing the code and syntax-checking each touched file in isolation
(`tsc --noEmit --skipLibCheck` per file, ignoring only "module not found"
noise from the missing `node_modules`), not by a real build or test run.
Run `pnpm install && pnpm typecheck && pnpm test` before trusting any of
this further.

## Frontend completion pass: every app built out against the full spec

Following the backend-focused pass above, this pass went through all three
Next.js apps page by page against the original spec and closed every gap
found - backend first, then the UI on top of it, same "no fake endpoints"
discipline as the rest of this README. Nothing pre-existing was rewritten,
only extended.

**`apps/web` (customer site):** the full customer dashboard (section 30) -
wishlist, invoices, saved travelers, notifications inbox, reviews, and
support tickets - none of which had *any* backend before this pass, not
even the tables' worth of routes. A new `services/account` was created to
own favorites/wishlist, saved traveler profiles (with AES-256-GCM
field-level encryption for passport numbers via a new `@travel/auth`
`encryptField`/`decryptField`, section 19/33), and support tickets, since
none of those belonged to an existing domain service. Also added:
password reset + email verification (new hashed single-use tokens, new
domain events, new email templates), an in-app notification inbox
(the notifications service was previously worker-only with zero HTTP
surface), invoice generation wired into the payment webhook itself (an
invoice is created/updated on every successful charge, including partial
payments), and a review-submission form on completed bookings.

**`apps/admin`:** bookings management (list/view/cancel-any, reusing the
exact same cancellation math as the customer-facing path rather than
duplicating it), user management (list/search/suspend/role-assignment),
an approval queue (the approve/reject endpoints existed with nothing
pointing at them), an audit log viewer (writing was implemented, reading
wasn't), cancellation policy management, a generic settings surface
(currency/fees/provider config), full reference-data CRUD (countries,
regions, cities, destination categories, transfer locations/airports -
section 2 & 44), a notification template editor, and revenue/bookings
time-series charts on the dashboard (rendered with a small dependency-free
inline SVG component rather than pulling in a charting library for two
charts).

**`apps/partner-portal`:** document upload/verification (a real
presigned-upload-URL flow through the existing media service, not a
stub), review responses, and - the most consequential finding of this
pass - full accommodation and vehicle/transport-route management. Both
had complete backend logic already written, but were **completely
unreachable by any real operator**: creation was gated on roles
(`accommodation_provider`, `transport_provider`) that the operator
approval flow never actually grants - it only ever grants `tour_operator`.
Fixed consistently across every affected route, including the
pre-existing route-creation endpoint, not just the new ones. Also added a
public cities lookup endpoint (closing a stopgap raw-city-ID text input
with a real dropdown) and an earnings-over-time chart.

Two route-ordering bugs were caught and fixed during this pass before
they shipped: a literal `/mine` path registered after a generic `/:id`
handler would have been permanently unreachable (Hono matches route
shape, not intent) - this is the same class of bug the pre-existing
`/operator/mine` route in the bookings service had already correctly
avoided, so the fix brings the new routes in line with that established
pattern rather than introducing a new one.

## Not yet built
Nothing from the original spec remains unaddressed except the
hosting/migration half of `deploy.yml` described above, which is
genuinely blocked on infrastructure secrets that don't exist in this
repo (see that section for exactly what's left and why).

## A real bug this pass fixed: production builds couldn't actually run

Every package's `package.json` had `"main": "./src/index.ts"` - fine for
`tsx watch` in dev, but fatal for a compiled production build: `node
dist/index.js` (exactly what every `Dockerfile.service`/`Dockerfile.worker`
runs, and what CI's new E2E job runs) would crash the instant it tried to
`import` any workspace package, because plain Node can't parse TypeScript
syntax, and Node module resolution for a bare specifier like
`@travel/service-auth` follows that package's own `"main"` field - straight
back to a `.ts` file.

Fixed by: adding a real `build` script (`tsc -p tsconfig.json`) to the 8
foundational packages that were missing one (`types`, `config`, `logger`,
`http`, `auth`, `events`, `validation`, `database` - the shared libraries
everything else depends on), fixing their `tsconfig.json` (they'd been set
to `noEmit: true`, which would have made `build` emit nothing even after
adding the script), and repointing every `"main"`/`"exports"` field
(including the `"./internal"` subpaths) at compiled `dist/` output across
all 14 services and the gateway. The root `build` script and the Docker
build commands used `pnpm --filter "X..." build` without `--if-present`,
which would have hard-failed the moment it hit a package lacking a build
script - fixed there too. None of this was exercised by the static
syntax-checking this project has relied on all session, which only proves
files parse, not that a built artifact can actually resolve its own
dependencies at runtime - worth being explicit about as a category of bug
this approach structurally can't catch.

## Testing

`tests/e2e` (new this pass) is a real cross-service E2E suite - black-box
HTTP tests against a running gateway, not mocks. Covers registration/login,
catalog browsing (asserts the server-computed quote matches the seeded
price exactly, not just "some number"), and - the most important test in
the repo - the full **booking → payment intent → webhook → CONFIRMED →
cancel** loop, which asserts the booking sits in `PAYMENT_PROCESSING` (not
confirmed) until a webhook actually fires, proving client-reported payment
status is never trusted. Also covers operator self-service and an admin
test that specifically catches the missing-role-grant regression fixed
earlier in this session.

Runs against the "mock" payment provider (`services/payments/src/providers/
mock-payment-provider.ts`, new this pass) - a real gap closed: there was
previously no way to exercise the payment flow at all without live M-Pesa/
Stripe sandbox credentials. It stays webhook-driven rather than
auto-confirming, so it tests the same architecture production uses, not a
shortcut around it, and `getPaymentProvider()` hard-blocks it in production
regardless of what's requested.

`pnpm --filter @travel/database db:seed` now also creates three
fixed-credential test accounts (admin/operator/customer,
password `Test-Passw0rd!` - clearly fictional, dev/CI only) and a fully
bookable demo package with a rolling 90-day availability window, which the
E2E suite depends on.

CI's `e2e-tests` job spins up scratch Postgres + Redis, migrates and seeds,
builds and boots the real gateway process, waits for `/health`, runs the
suite against it, and tears down - this is also what caught the
main-field/build-script bug above, since a broken build now fails this job
loudly instead of only failing silently in a Docker image nobody happened
to run.

To run the E2E suite locally: with Postgres/Redis up and migrated+seeded
(see Local setup below) and the gateway running (`pnpm dev:gateway`), run
`pnpm test:e2e` in another terminal. It talks to `http://localhost:4000` by
default - override with `E2E_API_URL` if the gateway is elsewhere.

## Partner Portal

`apps/partner-portal` (port 3002) is the operator-facing app: a two-step
registration flow (create account, then submit a business for review),
sign-in, a status-gated home page (distinguishes "not registered yet" from
"pending review" from "approved" using the real error codes
`resolveOperatorForUser` throws -- `NOT_FOUND` vs `CONFLICT` -- rather than
collapsing them into one generic empty state), a packages page (list plus
a create form covering the required fields, with a note that full
itinerary/multi-season pricing is an edit-after-create flow not built into
this form), a bookings list, and an earnings summary.

Building this surfaced a real, pre-existing bug I fixed rather than
building around: approving an operator never granted the `tour_operator`
role, so every operator-gated route (`/packages/mine`, package creation)
would have 403'd forever even for a fully-approved partner -- `status`
changed but RBAC never followed. `OperatorRepository.grantOperatorRoleToStaff`
now runs on approval and also when staff are added to an already-approved
operator later.

I also closed the "my packages" gap the portal's package list depends on:
`GET /api/v1/packages/mine` (operator self-service, drafts and pending
included, unlike the public search which is published-only), registered
before `/:slug` so Hono doesn't match "mine" as a slug param.

## Backend completion notes (previous pass)

**Reminder scheduling** is now real, not just event-reactive. When a
booking reaches `CONFIRMED` (full payment), `PaymentService` publishes a
`booking.confirmed` event (previously defined in the event contracts but
never actually published anywhere). The notifications worker schedules one
delayed BullMQ job per configured offset (`reminder_offsets_days` in
`system_settings`, default 30/7/3/1 days) with a stable `jobId` of
`reminder:{bookingId}:{offsetDays}` - replaying the same event (BullMQ's
at-least-once delivery) re-schedules the same jobs rather than duplicating
reminders. Offsets already in the past are skipped rather than firing a
reminder for a trip that's already happening or over.

**`services/media`** - the storage-provider abstraction the schema's
`storageKey`/`storage_key` columns have referenced since Phase 1 without
an implementation. `StorageProvider` interface (`getUploadUrl`,
`getPublicUrl`, `deleteObject`), a real `SupabaseStorageProvider`, and a
`MockStorageProvider` fallback - same pattern as email/SMS/WhatsApp. The
upload flow is presigned-URL-based (client uploads directly to storage,
never proxying file bytes through our API), and the storage key is always
server-generated (`{category}/{uploaderUserId}/{uuid}.{ext}`) rather than
client-supplied, closing off path-traversal/overwrite risk by construction.
Content-type is validated per category against an allow-list at the
schema level.

**Operator self-service**, closing the loop the Operators service opened:
`GET /api/v1/bookings/operator/mine` and `GET /api/v1/payments/earnings/me`
- both resolve the caller's own operator server-side rather than taking an
`:operatorId` param, so there's no ownership check to forget (no ID to
check ownership of in the first place).

## Admin

**`services/admin`** - dashboard metrics (bookings by status, gross revenue/
refunds/platform fees pulled from the `ledger_entries` table, active
destination/package/operator counts, popular destinations by booking count,
upcoming trips, cancellation rate) plus cross-cutting admin operations:
approve/reject destinations and packages, moderate reviews, manage
`system_settings` (e.g. `platform_commission_percent`), and create
cancellation policies. Every mutating action writes an `audit_logs` row.
Routes are per-route role-gated (not one blanket check on the whole router)
so e.g. `customer_support` can moderate reviews without also getting
dashboard/settings access.

**`apps/admin`** - a separate Next.js app (port 3001) reusing the same
design tokens as the customer site at a denser, more utilitarian scale:
sign-in, a metrics dashboard, a pending-operators approval queue, and a
flagged-reviews moderation queue. Run `pnpm --filter @travel/admin dev`
alongside the gateway.

## CI/CD

`.github/workflows/`:
- `ci.yml` - lint + typecheck (`pnpm -r --if-present`, so it runs on every
  package including the shared libraries under `packages/*`, not just
  services/apps), unit tests, a migration-drift check (fails if
  `drizzle-kit generate` would produce changes not already committed, then
  applies migrations to a scratch Postgres to confirm they actually run),
  a full monorepo build, and an advisory `pnpm audit`.
- `docker-build.yml` - matrix-builds every service's container image from
  its actual Dockerfile, so a broken Dockerfile fails CI instead of being
  discovered at deploy time. Flags honestly (via a `::warning::` and
  `continue-on-error`) that `apps/web` needs a Next.js-specific Dockerfile
  (standalone output) rather than the generic `Dockerfile.service` - not
  swept under the rug.
- `deploy.yml` - a real **skeleton**, not a working pipeline: it documents
  the dev → staging → production promotion flow and where GitHub
  Environments' required-reviewers gate belongs, but every actual deploy
  step is an explicit `### TODO` echo since no registry or hosting target
  is configured in this repo. Filling those in is required before this
  workflow deploys anything - flagged rather than faked.

## Tests

Unit tests exist for the business logic that most needs to be provably
correct - deliberately the pure, side-effect-free pieces, factored out of
their DB-touching callers specifically so they're testable without a
database:

- `packages/validation` - Zod schema tests (password/phone/idempotency-key
  rules, and an explicit assertion that `createBookingSchema` has no price
  field, so a client can never smuggle a price into a booking request).
- `services/packages` - the pricing engine (`calculatePackageQuote`):
  seasonal vs. year-round price selection, multi-traveler-type summation,
  mixed-currency rejection, rounding.
- `services/bookings` - the booking state machine (`isTransitionAllowed`,
  extracted from `transitionBookingStatus` for testability): the documented
  happy path, that terminal states can't be revived, that no status
  transitions to itself, and a consistency check that every status has an
  entry in the transition map. Also the cancellation-policy math
  (`selectApplicableRule` / `computeCancellationAmounts`), tested directly
  against the example day-bands from the engineering brief (>30 days = 100%
  refund, 15–30 = 75%, etc.), including boundary days (15 vs. 14, 30 vs. 31).
- `services/promotions` - coupon evaluation against a fake repository
  (expired/not-yet-active/usage-limit/min-amount/currency-mismatch cases),
  plus a test of the race-condition path where `applyCouponTx` must fail if
  another concurrent checkout consumed the last redemption between
  evaluation and commit.

Run `pnpm test` at the root to run every package's suite (pnpm skips
workspaces without a `test` script). Each of the four packages above also
has its own `vitest.config.ts` and `pnpm test` locally.

**Verification caveat, stated plainly:** this sandbox has no package
registry access, so these tests have never actually been executed - no
`vitest run` has happened anywhere in this build. What's been done instead:
every assertion was manually traced against the real implementation it
tests (documented inline in the build process), and every file syntax-
checks cleanly with zero duplicate-declaration errors. That is real
verification of logical correctness, but it is not the same as a green
test run - running `pnpm install && pnpm test` should be the first thing
done after cloning this, both to confirm the tests actually pass and to
catch anything a manual trace could have missed.

**`services/reviews`** - `create()` enforces the brief's rule directly (not
just as a comment): it looks up the caller's own booking, checks it's
`COMPLETED`, and rejects otherwise - there's no other path that writes a
review, so verification can't be bypassed. One review per (booking, subject)
pair. Includes operator responses, reporting, and moderation (role-gated).
Publishes a `review.created` domain event.

**`services/promotions`** - coupon CRUD, a read-only `evaluate()` for
showing "coupon applied" before checkout, and `applyCouponTx()` which
re-validates the coupon and atomically increments `used_count` only if still
under `max_uses` (a single `UPDATE ... WHERE used_count < max_uses RETURNING`
- the same guarded-increment pattern as the availability/room/seat capacity
checks elsewhere, so the last use of a limited coupon can't be double-spent
by concurrent checkouts). Wired into `BookingService.createBooking`: passing
`couponCode` now actually discounts the total, inside the same transaction
as inventory reservation, rather than being validated and silently ignored
as before.

**`apps/web`** - the customer-facing Next.js app: home (hero + featured
destinations/packages), destination browse/detail, package browse/detail
(itinerary, inclusions/exclusions, price), login/register, checkout (live
server-computed quote as travelers/date change, booking creation, payment
intent), and a bookings list + boarding-pass-styled booking detail page.
Session is a plain localStorage token for this scaffold - the code flags
where to swap in httpOnly cookies for production. Run `pnpm dev:web`
alongside the gateway (`pnpm dev:gateway`) to try it end to end.

Design direction: grounded in the product's actual concept (a package IS an
ordered multi-stop route) rather than a generic template - see the hero's
animated dashed route line connecting seeded stops, and package/booking
cards styled as boarding passes/tickets with a perforated tear line and
monospace reference codes. Palette avoids the common AI-generated defaults
(no cream+terracotta, no near-black+neon, no broadsheet): Horizon Ink,
Savanna Gold, Acacia, Sand Dune, Dusk Plum. Type: Zilla Slab (display) +
Inter (body) + IBM Plex Mono (prices/codes/dates).

The booking → payment → confirmation → notification loop is now end-to-end:
`POST /bookings` reserves inventory and creates a `PENDING_PAYMENT` booking →
`POST /payments/intents` initiates an M-Pesa STK push or Stripe PaymentIntent
→ the provider's webhook confirms the booking and posts ledger entries →
a domain event fires → the notifications worker emails (and SMS's) the
customer. Run `pnpm --filter @travel/service-notifications dev` (or
`pnpm dev:notifications`) alongside the gateway to see this working locally.

## Local setup

```bash
cp .env.example .env
# Fill in JWT_SECRET / JWT_REFRESH_SECRET at minimum (openssl rand -base64 48)

pnpm install

# Start Postgres + Redis
docker compose -f docker-compose.dev.yml up -d postgres redis

# Generate & run migrations, then seed demo data
pnpm db:generate
pnpm db:migrate
pnpm db:seed

# Run the gateway (mounts auth + destinations services)
pnpm dev:gateway
```

The gateway listens on `PORT` (default `4000`):
- `GET /health`, `/ready`, `/live`
- `POST /api/v1/auth/register`, `/login`, `/refresh`; `GET /api/v1/auth/me`
- `GET /api/v1/destinations`, `/api/v1/destinations/categories`,
  `GET /api/v1/destinations/:slug`
- `GET /api/v1/packages`, `GET /api/v1/packages/:slug`,
  `GET /api/v1/packages/:id/availability?from=&to=`,
  `GET /api/v1/packages/:id/quote?travelDate=&adults=&children=&infants=`,
  `GET /api/v1/packages/mine` (operator self-service, all statuses),
  `POST /api/v1/packages` (operator/admin), `PUT /api/v1/packages/:id/availability` (operator/admin)
- `POST /api/v1/bookings` (requires `Idempotency-Key` header),
  `GET /api/v1/bookings`, `GET /api/v1/bookings/:id`,
  `PATCH /api/v1/bookings/:id/cancel`, `GET /api/v1/bookings/operator/mine`
  (operator self-service) - all require auth
- `POST /api/v1/payments/intents` (auth required; `Idempotency-Key` header
  recommended), `POST /api/v1/payments/webhooks/mpesa`,
  `POST /api/v1/payments/webhooks/stripe` (both unauthenticated - trust comes
  from signature verification), `GET /api/v1/payments/bookings/:bookingId/ledger`,
  `GET /api/v1/payments/earnings/me` (operator self-service),
  and `POST /api/v1/payments/refunds` (both require `payment:view`/`payment:refund`)
- `POST /api/v1/media/upload-url` (auth required - returns a presigned
  upload URL + storage key), `GET /api/v1/media/public-url/:storageKey`
- `GET /api/v1/accommodations`, `GET /api/v1/accommodations/:id`,
  `GET /api/v1/accommodations/room-types/:roomTypeId/availability?checkIn=&checkOut=`,
  `POST /api/v1/accommodations` + `POST /api/v1/accommodations/:id/room-types` (operator/admin)
- `GET /api/v1/transport/routes`, `GET /api/v1/transport/routes/:id`,
  `POST /api/v1/transport/routes` (operator/admin)
- `GET /api/v1/transfers/locations`, `GET /api/v1/transfers`,
  `GET /api/v1/transfers/:id`, `POST /api/v1/transfers/locations` +
  `POST /api/v1/transfers` (operator/admin)
- `GET /api/v1/reviews`, `GET /api/v1/reviews/summary?subjectType=&subjectId=`,
  `POST /api/v1/reviews` (auth; only for completed bookings), `POST
  /api/v1/reviews/:id/respond` (operator/admin), `POST /api/v1/reviews/:id/report`,
  `PATCH /api/v1/reviews/:id/moderate` (admin/support)
- `POST /api/v1/promotions/coupons/validate` (public - pricing preview),
  `POST /api/v1/promotions/coupons` (operator/admin/marketing)
- `POST /api/v1/operators` (register; auth only), `GET /api/v1/operators/me`
  (resolve the caller's own operator), `GET /api/v1/operators` +
  `GET /api/v1/operators/:id` (admin/travel_manager), `POST
  /api/v1/operators/:id/review` + `/suspend` (admin), `PUT
  /api/v1/operators/:id/commission-rate` (admin/finance_manager), `POST
  /api/v1/operators/:id/staff`, `POST /api/v1/operators/:id/documents`,
  `POST /api/v1/operators/documents/:documentId/review` (admin)

## Design rules encoded (not just described) in this codebase

- **No client-trusted pricing or payment status.** `createBookingSchema` has no
  price field; `payments.status` only ever changes from a verified, signature-
  checked webhook (see the `payment_webhooks` table's `(provider, event_id)`
  uniqueness for replay protection).
- **Booking state machine is a real allow-list** (`BOOKING_STATUS_TRANSITIONS` in
  `@travel/types`), not prose - the eventual Booking service consults this before
  every status write.
- **Idempotency** is a unique DB constraint on `bookings.idempotency_key` and
  `payments.idempotency_key`, not just a convention.
- **Financial ledger is insert-only** (`ledger_entries`) and `booking_status_history`
  is append-only - corrections are new rows, never updates.
- **No public-facing sequential IDs** - every primary key is a UUID.
- **RBAC is enforced server-side** via `requirePermissions()` / `requireRoles()`
  Hono middleware reading from the verified JWT, never from client-supplied roles.
- **Every route returns the standard envelope** (`{success, data, meta}` or
  `{success:false, error, requestId}`) via the shared `@travel/http` package -
  no raw stack traces or DB errors ever reach the client.

## A note on verification

This environment has no package registry access, so `pnpm install` / `tsc`
against real type definitions couldn't be run here. Every `.ts` file was
syntax-checked individually with the TypeScript compiler (zero parse errors,
zero duplicate-declaration errors) and the schema's cross-file foreign-key
references were checked by hand for a valid dependency graph (no circular
imports). Run `pnpm install && pnpm typecheck` as the first step after cloning
to get full type-checking against real `node_modules`.
