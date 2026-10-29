# SaaS plan billing (tenants paying the platform)

This is **not** the payments service. `services/payments` collects *customers'* payments for bookings (M-Pesa / Stripe). This module is the platform charging *tenants* for their plan (Free / Starter / Growth / Enterprise) through **Stripe Subscriptions**.

Stripe hosts every screen that touches a card (Checkout to subscribe, the Billing Portal to change plan, cancel, update card, download invoices). No card data reaches this code.

## How it works

```
Tenant admin ──POST /admin/billing/checkout──► we create a Checkout Session ──► Stripe-hosted page ──► pays
                                                                                       │
Stripe ──signed webhook──► POST /api/v1/billing/webhooks/stripe ──► verify ► dedupe ► sync tenant plan
```

**The only thing that ever changes a tenant's plan is a signature-verified webhook.** Returning to `?checkout=success` proves nothing (anyone can visit that URL); the UI just polls until the webhook lands.

| Endpoint | Who | What |
|---|---|---|
| `GET  /api/v1/admin/billing` | tenant `admin`, `super_admin` | plan, subscription state, usage vs limits, purchasable plans |
| `POST /api/v1/admin/billing/checkout` `{planCode}` | tenant `admin` only | returns a Stripe Checkout URL |
| `POST /api/v1/admin/billing/portal` | tenant `admin` only | returns a Billing Portal URL |
| `PATCH /api/v1/platform/plans/:id/stripe-price` | `super_admin` | map a plan to a Stripe price (verified against Stripe) |
| `POST /api/v1/billing/webhooks/stripe` | Stripe | subscription lifecycle events |

`super_admin` deliberately cannot start checkout/portal: a platform operator must not be able to subscribe a tenant to a paid plan. (Any user with the tenant's `admin` role can; restrict further if you want owner-only.)

## One-time setup

1. **Stripe Dashboard → Products:** create a recurring **monthly, USD** price for each paid plan. The amount must equal the plan's `monthly_price_usd` exactly.
2. **Webhook endpoint:** Developers → Webhooks → add `https://<your-api>/api/v1/billing/webhooks/stripe`, events:
   `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`.
   Copy its signing secret. **This endpoint has its own secret**; it is *not* the payments endpoint's `STRIPE_WEBHOOK_SECRET`.
3. **Customer Portal:** Settings → Billing → Customer portal → enable plan switching (add your products), cancellation, payment-method updates.
4. **Retry policy:** Settings → Billing → Subscriptions and emails → set Smart Retries and, importantly, **"cancel the subscription"** (not "leave past-due") after retries are exhausted - otherwise a non-paying tenant keeps the plan indefinitely.
5. **Environment:**
   ```
   STRIPE_SECRET_KEY=sk_live_...
   STRIPE_BILLING_WEBHOOK_SECRET=whsec_...
   ADMIN_APP_URL=https://admin.yourdomain.com
   PUBLIC_API_URL=https://api.yourdomain.com
   ```
6. **Map each plan to its price** (verifies it against Stripe first - active, monthly, USD, exact amount):
   ```bash
   curl -X PATCH $API/api/v1/platform/plans/<planId>/stripe-price \
     -H "Authorization: Bearer <super_admin token>" -H 'content-type: application/json' \
     -d '{"stripePriceId":"price_..."}'
   ```
   A plan with no mapped price is simply not offered for purchase. A price can map to only one plan (database constraint).
7. Make sure a plan with code **`free`** exists (the seed creates it). It is where cancelled tenants land.

Without `STRIPE_SECRET_KEY` the billing endpoints answer `502 billing is not configured`; the rest of the platform is unaffected and plans can still be assigned manually.

## Lifecycle rules

| Stripe status | Tenant's plan |
|---|---|
| `active`, `trialing` | the plan mapped to the subscription's price |
| `past_due` | **kept** (dunning grace period - Stripe is retrying the card); UI shows a payment-problem banner |
| `canceled`, `unpaid`, `incomplete_expired` | **downgraded to `free`** |
| `incomplete`, `paused` | unchanged |

Safety rules baked in (all unit-tested):

- A tenant is **never** downgraded to "no plan": in this code base `plan_id = NULL` means *unlimited*. If no `free` plan exists the plan is left alone and an error is logged.
- A paid subscription on a price **no plan maps to** leaves the plan unchanged and logs an error, rather than guessing.
- Stripe delivers events **at least once and out of order**. Events older than the last one applied are ignored; duplicates are deduplicated by event id; a late `deleted` for an *old* subscription never downgrades a tenant who has since re-subscribed.
- The event record, the tenant update and the "processed" mark are **one transaction**. If processing fails, nothing is recorded and Stripe's retry reprocesses it.
- Starting Checkout while a live subscription exists is refused (it would double-bill).
- An event for a different Stripe customer than the tenant is bound to is ignored.
- A super_admin cannot hand-assign a plan to a tenant with a live Stripe subscription (the next webhook would silently overwrite it). Hand-assignment is for tenants billed outside Stripe (enterprise contracts, comped accounts).

Every webhook is recorded in `billing_events` (id, type, resolved tenant, outcome, payload) - that table is the audit trail for "why did this tenant's plan change?".

## Downgrade consequences

Limits only block *creating more*. A tenant downgraded to `free` while over its limits keeps its existing operators/staff; it just can't add more until it's under the limit or re-subscribes.

## Local testing

Stripe test mode + the Stripe CLI:

```bash
stripe listen --forward-to localhost:4000/api/v1/billing/webhooks/stripe   # prints a whsec_... for STRIPE_BILLING_WEBHOOK_SECRET
# subscribe through the admin UI with test card 4242 4242 4242 4242, then:
stripe trigger customer.subscription.deleted
```

## Not built (known gaps)

- No dunning **emails** from this app: `past_due` shows a banner in the admin UI; configure Stripe's own failed-payment emails.
- No proration/seat-based pricing: one flat monthly price per plan.
- No annual billing, taxes (use Stripe Tax), or coupons beyond Checkout's promotion-code box.
- **Not yet verified against live Stripe:** everything is tested with the real Stripe SDK's signature scheme, a fake gateway, and a real database, but Checkout/Portal session creation has not been exercised against Stripe's API. Run through test mode once before going live.
