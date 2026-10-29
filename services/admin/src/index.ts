import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { env } from "@travel/config";
import { collectAllowedVideoHosts } from "@travel/validation";
import { createServiceLogger } from "@travel/logger";
import { createDb } from "@travel/database";
import { buildErrorHandler, requestIdMiddleware, ok } from "@travel/http";
import { UserRepository, AuthService, RefreshTokenRepository } from "@travel/service-auth/internal";
import { EventPublisher } from "@travel/events";
import { MetricsRepository } from "./repositories/metrics-repository.js";
import { AdminOperationsRepository } from "./repositories/admin-operations-repository.js";
import { TenantRepository } from "./repositories/tenant-repository.js";
import { AdminService } from "./services/admin-service.js";
import { TenantService } from "./services/tenant-service.js";
import { BillingRepository } from "./billing/billing-repository.js";
import { BillingService } from "./billing/billing-service.js";
import { StripeBillingGateway } from "./billing/billing-gateway.js";
import { buildBillingWebhookRoutes } from "./billing/billing-routes.js";
import { buildAdminRoutes } from "./routes.js";
import { buildPlatformRoutes } from "./platform-routes.js";
import { buildPublicSignupRoutes } from "./public-routes.js";
import { SiteContentRepository } from "./site/site-content-repository.js";
import { SiteContentService } from "./site/site-content-service.js";
import { buildAdminSiteRoutes, buildPublicSiteRoutes } from "./site/site-routes.js";

const logger = createServiceLogger("admin-service");
const db = createDb(env.DATABASE_URL);

const metricsRepository = new MetricsRepository(db);
const adminOperationsRepository = new AdminOperationsRepository(db);
const adminService = new AdminService(metricsRepository, adminOperationsRepository);

// Wired directly rather than over HTTP, same in-process pattern the
// Booking service uses for packages/accommodation/transport/etc via
// each service's own /internal export - see @travel/service-auth/internal.
const userRepository = new UserRepository(db);
const authServiceForTenants = new AuthService(userRepository, new EventPublisher(), new RefreshTokenRepository(db));
const tenantRepository = new TenantRepository(db);
const tenantService = new TenantService(tenantRepository, authServiceForTenants, adminOperationsRepository, metricsRepository, db);

// Null when STRIPE_SECRET_KEY is absent: billing endpoints then answer 502
// "not configured" rather than the process pretending to bill.
const billingGateway = env.STRIPE_SECRET_KEY
  ? new StripeBillingGateway(env.STRIPE_SECRET_KEY, env.STRIPE_BILLING_WEBHOOK_SECRET)
  : null;
const billingService = new BillingService(new BillingRepository(db), billingGateway, adminOperationsRepository, db, {
  adminAppUrl: env.ADMIN_APP_URL,
});

// Per-tenant public site content (name, hero, testimonials, story, contact, ...) - see ./site.
const siteContentService = new SiteContentService(
  new SiteContentRepository(db),
  adminOperationsRepository,
  // Only restricts once real storage is configured; with neither set the list is empty = unrestricted (as before).
  env.SUPABASE_URL || env.MEDIA_CDN_URL ? collectAllowedVideoHosts(env.SUPABASE_URL, env.MEDIA_CDN_URL, env.MEDIA_ALLOWED_VIDEO_HOSTS) : []
);

export const app = new Hono();
app.use("*", requestIdMiddleware);
app.onError(buildErrorHandler());

app.get("/health", (c) => ok(c, { status: "ok", service: "admin" }));
app.get("/ready", (c) => ok(c, { status: "ready" }));
// Mounted BEFORE the catch-all below so the site routes carry only their own auth (requireAuth + admin roles).
app.route("/site", buildAdminSiteRoutes(siteContentService));
app.route("/", buildAdminRoutes(adminService, tenantService, billingService));

/**
 * Platform-level, cross-tenant tenant-management endpoints - kept as a
 * separate exported Hono app (rather than mounted onto `app` above)
 * because the gateway mounts it at a different path prefix
 * (/api/v1/platform, not /api/v1/admin) that bypasses tenant-context
 * resolution entirely. See apps/api-gateway/src/index.ts.
 */
export const platformApp = new Hono();
platformApp.use("*", requestIdMiddleware);
platformApp.onError(buildErrorHandler());
platformApp.get("/health", (c) => ok(c, { status: "ok", service: "admin-platform" }));
platformApp.route("/", buildPlatformRoutes(tenantService, db, billingService));

/**
 * Self-serve tenant signup - kept as its own exported app (not merged
 * into platformApp) even though both are mounted outside the gateway's
 * tenant-context resolution, because platformApp is entirely
 * super_admin-gated while this one is deliberately public. Keeping them
 * separate means a future change to platformApp's auth (e.g. an
 * additional role check) can never accidentally leak onto this route
 * by being applied via a shared `app.use("*", ...)`.
 */
/** Stripe billing webhooks. Tenant-less by nature; mounted by the gateway under a /webhooks/ path. */
export const billingWebhookApp = new Hono();
billingWebhookApp.use("*", requestIdMiddleware);
billingWebhookApp.onError(buildErrorHandler());
billingWebhookApp.route("/", buildBillingWebhookRoutes(billingService));

export const publicSignupApp = new Hono();
publicSignupApp.use("*", requestIdMiddleware);
publicSignupApp.onError(buildErrorHandler());
publicSignupApp.get("/health", (c) => ok(c, { status: "ok", service: "admin-public-signup" }));
publicSignupApp.route("/", buildPublicSignupRoutes(tenantService, db));

if (import.meta.url === `file://${process.argv[1]}`) {
  serve({ fetch: app.fetch, port: env.PORT }, (info) => {
    logger.info(`admin service listening on port ${info.port}`);
  });
}

/**
 * The PUBLIC half of site content: what a tenant's storefront renders. Its own exported app (like
 * platformApp) because the gateway mounts it at /api/v1/site, outside the /admin prefix and its auth.
 * Tenant-scoped (the gateway resolves the tenant), but needs no login.
 */
export const siteApp = new Hono();
siteApp.use("*", requestIdMiddleware);
siteApp.onError(buildErrorHandler());
siteApp.get("/health", (c) => ok(c, { status: "ok", service: "site" }));
siteApp.route("/", buildPublicSiteRoutes(siteContentService));
