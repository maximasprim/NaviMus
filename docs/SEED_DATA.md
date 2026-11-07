# Demo / QA seed data

Dev and CI only. These credentials live in source control - **never seed them into a production database.**

## Commands

```bash
pnpm db:migrate     # schema (run first on a new or out-of-date database)
pnpm db:reseed      # WIPE every application table, then seed everything
pnpm db:reset       # wipe only (needs --yes: pnpm db:reset -- --yes)
pnpm db:seed        # seed only - fails on a database that is already seeded
```

`db:reset` deletes **all rows of every app table**, not just seeded rows. It prints the target host/database first,
refuses to run with `NODE_ENV=production`, and uses the owner connection (`DATABASE_MIGRATION_URL`, else `DATABASE_URL`).
Check that target line before you let it run against a hosted database.

## Accounts

| Tenant | Email | Password | Role |
|---|---|---|---|
| default | admin@navimus.co.ke | `@0743493619Nn` | super_admin (crosses every tenant) |
| default | operator@navimus.co.ke | `@0743493619Oo` | tour_operator (Rift Valley Safaris) |
| default | customer@navimus.co.ke | `@0743493619Cc` | customer |
| enroute-travel-demo | admin@enroute.co.ke | `@0743493619Ee` | admin (tenant owner) |

Extra accounts - password by group:

- **Staff `@0743493619Ss`** - default tenant: `manager@` (admin), `travel.manager@`, `destinations@`, `finance@`, `support@`, `marketing@`, `guide@` (all `@navimus.co.ke`). Enroute: `finance@enroute.co.ke`. Extra tenants: `admin@trial.navimus.co.ke` (trial tenant `kilimani-escapes-trial`), `admin@suspended.navimus.co.ke` (suspended tenant `dusty-trails-suspended` - login is blocked on purpose).
- **Operators `@0743493619Oo`** - `stays@` (accommodation provider), `transport@` (transport provider), `coastal.ops@`, `trails.ops@`, `heritage.ops@`, `baobab.ops@` (operator still *pending approval*), all `@navimus.co.ke`; Enroute: `escapes.ops@`, `city.ops@` (`@enroute.co.ke`).
- **Customers `@0743493619Cc`** - default tenant: `amina.hassan`, `brian.otieno`, `catherine.wanjiru`, `david.kimani`, `esther.achieng`, `faith.mutua`, `george.omondi`, `hannah.smith`, `james.miller`, `klaus.weber`, `priya.patel` (all `@navimus.co.ke`); `sofia.rossi` has an unverified email, `tom.baker` is suspended, `ursula.keller` is deactivated. Enroute: `kamau.njoroge`, `lucy.wambui`, `mohamed.said`, `nancy.adhiambo` (`@enroute.co.ke`).

Passwords are defined in `SEED_ACCOUNTS` (`packages/database/src/seed/index.ts`) and `EXTRA_PASSWORDS` (`seed/demo/people.ts`).

## What gets created

- **Default tenant (NaviMus):** 9 operators (5 approved, 1 pending, 1 suspended, 1 rejected, plus the original), 17 destinations (1 draft), 15 packages (1 draft; 4 priced in **KES** so M-Pesa checkout can be tested), 11 accommodations with room types and rooms, 3 transport providers with vehicles and routes, airport transfers, 3 cancellation policies per approved operator, and 150 days of availability per published package (some partly booked, some sold out, some closed).
- **Enroute tenant:** 3 operators (1 pending), 6 destinations, 6 packages, 2 accommodations, transport, transfers, customised site content.
- **People:** 19 customers with saved travelers (passport numbers encrypted when `ENCRYPTION_KEY` is set), staff for every role, operator-company staff.
- **Bookings:** 39, covering every status (DRAFT through REFUNDED, plus EXPIRED and FAILED), spread over the last ~6 months so dashboards and charts have history. Each carries travelers, add-ons (transport/accommodation/transfer), status history and, where relevant, payments (M-Pesa for KES, Stripe for USD), provider transactions and webhooks, ledger entries, invoices, cancellations and refunds.
- **Also:** 18 reviews (published, pending moderation, removed, with operator replies), coupons, promotions, notification logs, support tickets with conversations, favorites, search history, audit logs, platform settings, operator documents.

Coupons (default tenant): `WELCOME10`, `EARLYBIRD15`, `SAFARI50` (Rift Valley Safaris, min 500 USD), `COASTAL12` (Coastal Breeze), `KES1000` (KES bookings), plus `EXPIRED20`, `SOLDOUT25` and `DISABLED30` for the failure paths. Enroute: `ENROUTE10`, `COAST500`, and the expired `ENROUTEOLD`.

## Things to know

- Seeded unpaid bookings hold their seats for **one day** (not the usual 15 minutes) so they are still there when you come back.
- The original demo package (`3-day-maasai-mara-safari-demo`) has a flat price on purpose: `tests/e2e` asserts a quote of exactly 1300.00 for two adults.
- The default tenant has no saved site content on purpose: the e2e site-content test uses it as the untouched control.
- Running the whole e2e suite against a gateway with the default `RATE_LIMIT_MAX=100` can hit HTTP 429 (the suite is one IP). Start the test gateway with a higher limit, e.g. `RATE_LIMIT_MAX=2000`.
