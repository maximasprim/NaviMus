import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import Redis from "ioredis";
import { env, isProduction } from "@travel/config";
import { createServiceLogger } from "@travel/logger";
import { buildErrorHandler, requestIdMiddleware, parseAllowedOrigins, resolveCorsOrigin, CORS_ALLOW_HEADERS, CORS_ALLOW_METHODS, CORS_EXPOSE_HEADERS, ok, rateLimit, tenantContext, accessLog, type ResolvedTenant } from "@travel/http";
import { and, checkRlsEnforcement, createDb, eq, isNotNull, runInTenantContext, schema } from "@travel/database";
import { app as authServiceApp } from "@travel/service-auth";
import { app as destinationsServiceApp } from "@travel/service-destinations";
import { app as packagesServiceApp } from "@travel/service-packages";
import { app as bookingsServiceApp } from "@travel/service-bookings";
import { app as paymentsServiceApp } from "@travel/service-payments";
import { app as accommodationServiceApp } from "@travel/service-accommodation";
import { app as transportServiceApp } from "@travel/service-transport";
import { app as transfersServiceApp } from "@travel/service-transfers";
import { app as reviewsServiceApp } from "@travel/service-reviews";
import { app as promotionsServiceApp } from "@travel/service-promotions";
import { app as operatorsServiceApp } from "@travel/service-operators";
import { app as adminServiceApp, platformApp as platformServiceApp, publicSignupApp, billingWebhookApp, siteApp as siteServiceApp } from "@travel/service-admin";
import { app as mediaServiceApp } from "@travel/service-media";
import { app as notificationsServiceApp } from "@travel/service-notifications";
import { app as accountServiceApp } from "@travel/service-account";

const logger = createServiceLogger("api-gateway");
const redis = new Redis(env.REDIS_URL);
const db = createDb(env.DATABASE_URL);

/**
 * RLS only protects anything if this process connects as a role the
 * policies apply to (not a superuser, not BYPASSRLS, not the table owner).
 * Hosted Postgres' default admin role usually is one of those, in which
 * case enabling RLS "works" and protects nothing. Fail loudly at boot.
 */
void (async () => {
  const report = await checkRlsEnforcement(db);
  if (report.enforced) {
    logger.info("Row-level security is enforced for this database role");
    return;
  }
  const message = `Row-level security is NOT enforced for this connection: ${report.problems.join("; ")}. Connect as the travel_app role (see docs/RLS.md).`;
  if (isProduction() && env.REQUIRE_RLS) {
    logger.fatal({ problems: report.problems }, message);
    process.exit(1);
  }
  logger.warn({ problems: report.problems }, message);
})().catch((err) => {
  logger.error({ err }, "Could not verify row-level security enforcement");
  if (isProduction() && env.REQUIRE_RLS) process.exit(1);
});

/**
 * Backs tenantContext's injected resolver. Looked up per-request rather
 * than cached here in Phase 2 - caching tenant lookups (they change
 * rarely: created, suspended, renamed) is a reasonable follow-up once
 * this is under real load, but correctness first.
 */
async function resolveTenant({ id, slug, domain }: { id?: string; slug?: string; domain?: string }): Promise<ResolvedTenant | null> {
  const condition = id
    ? eq(schema.tenants.id, id)
    : slug
      ? eq(schema.tenants.slug, slug)
      : domain
        ? // Only ever matches a VERIFIED custom domain - see
          // tenant-context.ts's doc comment for why an unverified one
          // (a tenant merely typing a domain into their own settings)
          // must never be enough to claim that domain's traffic.
          and(eq(schema.tenants.customDomain, domain), isNotNull(schema.tenants.customDomainVerifiedAt))
        : undefined;
  if (!condition) return null;
  const [tenant] = await db.select().from(schema.tenants).where(condition).limit(1);
  if (!tenant || tenant.deletedAt) return null;
  return { id: tenant.id, slug: tenant.slug, status: tenant.status };
}

const app = new Hono();

app.use("*", requestIdMiddleware);
const corsAllowlist = parseAllowedOrigins(env.CORS_ALLOWED_ORIGINS);
if (isProduction() && corsAllowlist.length === 0) {
  logger.info("CORS_ALLOWED_ORIGINS is empty: no cross-origin browser access is allowed (fine when the web apps use their same-origin /api/v1 proxy)");
}
app.use(
  "*",
  cors({
    // Explicit allowlist, never "*" and never a reflected arbitrary origin.
    origin: (origin) => resolveCorsOrigin(origin, corsAllowlist, { production: isProduction() }),
    allowMethods: CORS_ALLOW_METHODS,
    allowHeaders: CORS_ALLOW_HEADERS,
    exposeHeaders: CORS_EXPOSE_HEADERS,
    maxAge: 600,
    // Deliberately NOT credentialed: the httpOnly session cookie must be unusable
    // from another origin (that would reopen CSRF). Cross-origin callers use Bearer tokens.
    credentials: false,
  })
);
app.use("*", secureHeaders());
app.use(
  "/api/*",
  rateLimit(redis, { windowMs: env.RATE_LIMIT_WINDOW_MS, max: env.RATE_LIMIT_MAX, keyPrefix: "gw" })
);
// Stricter limit specifically on self-serve tenant signup - a public,
// unauthenticated, account-creating endpoint is a much more attractive
// abuse target (spam tenants, credential-stuffing owner emails) than
// ordinary authenticated API traffic, so it gets its own tighter budget
// on top of (not instead of) the general one above. Excludes
// /resolve-domain: that one is a read-only lookup hit on every
// server-rendered page load of a custom-domain storefront (see
// apps/web/lib/tenant-server.ts), not an account-creation action, so it
// stays on the general /api/* limit above instead of this tighter one.
app.use(
  "/api/v1/signup/*",
  async (c, next) => {
    if (c.req.path === "/api/v1/signup/resolve-domain") return next();
    return rateLimit(redis, { windowMs: env.RATE_LIMIT_WINDOW_MS, max: Math.max(5, Math.floor(env.RATE_LIMIT_MAX / 20)), keyPrefix: "gw-signup" })(c, next);
  }
);

// Resolves tenant context for every API request except: the reserved
// /api/v1/platform/* and /api/v1/signup/* prefixes (Phase 4/5's
// cross-tenant super_admin and self-serve-signup endpoints - neither has
// a single tenant to resolve: platform operates across all of them,
// signup doesn't have one yet), and any /webhooks/ path. Payment-provider
// webhooks (Stripe, M-Pesa) carry no tenant header or recognizable
// subdomain - the provider doesn't know our tenant concept exists - so
// PaymentService.handleWebhook discovers the tenant itself from the
// payment record via findByProviderReference, and this bypass is what
// stops tenantContext 404ing the callback before it gets there.
app.use("/api/*", async (c, next) => {
  if (
    c.req.path.startsWith("/api/v1/platform/") ||
    c.req.path.startsWith("/api/v1/signup/") ||
    c.req.path.includes("/webhooks/")
  ) {
    return next();
  }
  return tenantContext(resolveTenant)(c, next);
});

// Structured, tenant-tagged request log - mounted right after
// tenantContext so tenantId is already resolved by the time this reads
// it. Replaces hono/logger's plain text line entirely (removed above),
// rather than running both - one access log, not two.
app.use("*", accessLog(logger));

// Runs AFTER tenantContext (needs c.get("tenantId"), which the block
// above just set) and skips the same prefixes that middleware skips -
// there's no tenant to aggregate by there. See RATE_LIMIT_TENANT_MAX's
// doc comment in @travel/config for why this exists alongside, not
// instead of, the per-user/IP limiter above.
app.use("/api/*", async (c, next) => {
  if (
    c.req.path.startsWith("/api/v1/platform/") ||
    c.req.path.startsWith("/api/v1/signup/") ||
    c.req.path.includes("/webhooks/")
  ) {
    return next();
  }
  return rateLimit(redis, {
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max: env.RATE_LIMIT_TENANT_MAX ?? env.RATE_LIMIT_MAX * 20,
    keyPrefix: "gw-tenant",
    keyFn: (ctx) => ctx.get("tenantId") ?? "no-tenant",
  })(c, next);
});

/**
 * Confines every database access made while serving this request to the
 * resolved tenant, enforced by Postgres row-level security (see
 * packages/database/src/rls-context.ts). Routes that deliberately have no
 * tenant (platform, signup, provider webhooks) skip this and establish their
 * own explicit, authorised context instead.
 *
 * Errors are handled inside Hono's compose, so `next()` resolves normally
 * and the transaction COMMITs - matching the previous autocommit behaviour
 * where writes made before an error stayed written. (A statement that fails
 * at the database level aborts the transaction, which then rolls back.)
 */
app.use("/api/*", async (c, next) => {
  const tenantId = c.get("tenantId");
  if (!tenantId) return next();
  await runInTenantContext(db, tenantId, async () => {
    await next();
  });
});

app.onError(buildErrorHandler());

app.get("/health", (c) => ok(c, { status: "ok", service: "api-gateway" }));
app.get("/ready", (c) => ok(c, { status: "ready" }));
app.get("/live", (c) => ok(c, { status: "live" }));

// Versioned API surface. Each domain service is mounted at its
// own prefix - this is where a service gets extracted to its own
// deployment later: swap the mount for an HTTP proxy call with an
// unchanged external contract.
app.route("/api/v1/auth", authServiceApp);
app.route("/api/v1/destinations", destinationsServiceApp);
app.route("/api/v1/packages", packagesServiceApp);
app.route("/api/v1/bookings", bookingsServiceApp);
app.route("/api/v1/payments", paymentsServiceApp);
app.route("/api/v1/accommodations", accommodationServiceApp);
app.route("/api/v1/transport", transportServiceApp);
app.route("/api/v1/transfers", transfersServiceApp);
app.route("/api/v1/reviews", reviewsServiceApp);
app.route("/api/v1/promotions", promotionsServiceApp);
app.route("/api/v1/operators", operatorsServiceApp);
app.route("/api/v1/admin", adminServiceApp);
app.route("/api/v1/site", siteServiceApp); // public storefront content for the resolved tenant
app.route("/api/v1/platform", platformServiceApp);
app.route("/api/v1/billing", billingWebhookApp); // Stripe plan-billing webhooks (tenant-less; see /webhooks/ exemption)
app.route("/api/v1/signup", publicSignupApp);
app.route("/api/v1/media", mediaServiceApp);
app.route("/api/v1/notifications", notificationsServiceApp);
app.route("/api/v1/account", accountServiceApp);

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  logger.info(`api-gateway listening on port ${info.port}`);
});
