import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  approveDestinationSchema,
  approvePackageSchema,
  createCancellationPolicySchema,
  createCitySchema,
  createCountrySchema,
  createDestinationCategorySchema,
  createRegionSchema,
  createTransferLocationSchema,
  dashboardMetricsQuerySchema,
  moderateReviewSchema,
  setCustomDomainSchema,
  updateSystemSettingSchema,
  upsertNotificationTemplateSchema,
} from "@travel/validation";
import { ok, paginated } from "@travel/http";
import { requireAuth, requireRoles } from "@travel/auth";
import { NotFoundError } from "@travel/types";
import type { AdminService } from "./services/admin-service.js";
import type { TenantService } from "./services/tenant-service.js";
import type { BillingService } from "./billing/billing-service.js";
import { buildTenantBillingRoutes } from "./billing/billing-routes.js";

const auditLogQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

function requireParam(c: any, name: string): string {
  const value = c.req.param(name);
  if (!value) throw new NotFoundError(name);
  return value;
}

export function buildAdminRoutes(service: AdminService, tenants: TenantService, billing: BillingService) {
  const app = new Hono();

  // requireAuth only here - each route below declares its OWN role list.
  // A blanket requireRoles("admin","super_admin") on "*" would make the
  // more permissive per-route checks (e.g. customer_support on moderation,
  // finance_manager on cancellation policies) unreachable dead code, since
  // the global gate would reject those roles before the route ever runs.
  app.use("*", requireAuth);

  // Tenant self-service plan billing (Stripe Checkout / Billing Portal).
  app.route("/billing", buildTenantBillingRoutes(billing));

  // Resolves to null for a super_admin (platform-wide, cross-tenant
  // aggregate - dashboard/settings/audit-logs support this explicitly),
  // or the admin's own tenant otherwise. Used wherever a metric or
  // setting can legitimately be either scoped to one tenant or seen
  // across all of them.
  function scopeOrNull(c: any): string | null {
    const authUser = c.get("authUser");
    return authUser.roles.includes("super_admin") ? null : c.get("tenantId");
  }

  app.get(
    "/dashboard",
    requireRoles("admin", "super_admin"),
    zValidator("query", dashboardMetricsQuerySchema),
    async (c) => {
      const { from, to } = c.req.valid("query");
      const metrics = await service.getDashboardMetrics(scopeOrNull(c), { from, to });
      return ok(c, metrics);
    }
  );

  app.get(
    "/dashboard/timeseries",
    requireRoles("admin", "super_admin"),
    zValidator("query", dashboardMetricsQuerySchema),
    async (c) => {
      const { from, to } = c.req.valid("query");
      const series = await service.getDashboardTimeSeries(scopeOrNull(c), { from, to });
      return ok(c, series);
    }
  );

  app.patch(
    "/destinations/:id/approve",
    requireRoles("admin", "super_admin", "destination_manager"),
    zValidator("json", approveDestinationSchema),
    async (c) => {
      const authUser = c.get("authUser");
      const id = requireParam(c, "id");
      const { decision, reason } = c.req.valid("json");
      const destination = await service.approveDestination(c.get("tenantId"), id, decision, authUser.sub, reason);
      return ok(c, destination);
    }
  );

  app.patch(
    "/packages/:id/approve",
    requireRoles("admin", "super_admin", "travel_manager"),
    zValidator("json", approvePackageSchema),
    async (c) => {
      const authUser = c.get("authUser");
      const id = requireParam(c, "id");
      const { decision, reason } = c.req.valid("json");
      const pkg = await service.approvePackage(c.get("tenantId"), id, decision, authUser.sub, reason);
      return ok(c, pkg);
    }
  );

  app.patch(
    "/reviews/:id/moderate",
    requireRoles("admin", "super_admin", "customer_support"),
    zValidator("json", moderateReviewSchema),
    async (c) => {
      const authUser = c.get("authUser");
      const id = requireParam(c, "id");
      const { status } = c.req.valid("json");
      const review = await service.moderateReview(c.get("tenantId"), id, status, authUser.sub);
      return ok(c, review);
    }
  );

  app.get("/settings", requireRoles("admin", "super_admin"), async (c) => {
    const settings = await service.listSettings(scopeOrNull(c));
    return ok(c, settings);
  });

  app.put(
    "/settings",
    requireRoles("admin", "super_admin"),
    zValidator("json", updateSystemSettingSchema),
    async (c) => {
      const authUser = c.get("authUser");
      const { key, value, description } = c.req.valid("json");
      const setting = await service.updateSetting(scopeOrNull(c), key, value, authUser.sub, description);
      return ok(c, setting);
    }
  );

  app.post(
    "/cancellation-policies",
    requireRoles("admin", "super_admin", "finance_manager"),
    zValidator("json", createCancellationPolicySchema),
    async (c) => {
      const authUser = c.get("authUser");
      const input = c.req.valid("json");
      const policy = await service.createCancellationPolicy(c.get("tenantId"), input, authUser.sub);
      return ok(c, policy, undefined, 201);
    }
  );

  app.get("/cancellation-policies", requireRoles("admin", "super_admin", "finance_manager"), async (c) => {
    const policies = await service.listCancellationPolicies(c.get("tenantId"));
    return ok(c, policies);
  });

  app.get("/approvals/pending", requireRoles("admin", "super_admin", "destination_manager", "travel_manager"), async (c) => {
    const pending = await service.listPendingApprovals(c.get("tenantId"));
    return ok(c, pending);
  });

  app.get(
    "/audit-logs",
    requireRoles("admin", "super_admin"),
    zValidator("query", auditLogQuerySchema),
    async (c) => {
      const { page, pageSize } = c.req.valid("query");
      const { items, total } = await service.listAuditLogs(scopeOrNull(c), page, pageSize);
      return paginated(c, items, page, pageSize, total);
    }
  );

  // --- Reference data (spec section 44) ---
  // Geography (countries/regions/cities) is shared platform-wide reference
  // data, not tenant-scoped - intentionally no tenantId on these four.
  app.get("/countries", requireRoles("admin", "super_admin", "destination_manager"), async (c) => {
    return ok(c, await service.listCountries());
  });
  app.post(
    "/countries",
    requireRoles("admin", "super_admin"),
    zValidator("json", createCountrySchema),
    async (c) => ok(c, await service.createCountry(c.req.valid("json")), undefined, 201)
  );

  app.get("/regions", requireRoles("admin", "super_admin", "destination_manager"), async (c) => {
    return ok(c, await service.listRegions(c.req.query("countryId")));
  });
  app.post(
    "/regions",
    requireRoles("admin", "super_admin"),
    zValidator("json", createRegionSchema),
    async (c) => ok(c, await service.createRegion(c.req.valid("json")), undefined, 201)
  );

  app.get("/cities", requireRoles("admin", "super_admin", "destination_manager"), async (c) => {
    return ok(c, await service.listCities(c.req.query("regionId")));
  });
  app.post(
    "/cities",
    requireRoles("admin", "super_admin"),
    zValidator("json", createCitySchema),
    async (c) => ok(c, await service.createCity(c.req.valid("json")), undefined, 201)
  );

  // Tenant-owned catalog data (categories/transfer-locations/templates) -
  // always acts on the one tenant the request resolved to, whether that's
  // a regular admin's own tenant or whichever tenant a super_admin's
  // request happened to resolve (header/subdomain). Selecting a
  // different tenant to manage as a super_admin is Phase 4 (tenant
  // impersonation), not something these routes need to solve themselves.
  app.get("/categories", requireRoles("admin", "super_admin", "destination_manager"), async (c) => {
    return ok(c, await service.listDestinationCategories(c.get("tenantId")));
  });
  app.post(
    "/categories",
    requireRoles("admin", "super_admin"),
    zValidator("json", createDestinationCategorySchema),
    async (c) => ok(c, await service.createDestinationCategory(c.get("tenantId"), c.req.valid("json")), undefined, 201)
  );

  app.get("/transfer-locations", requireRoles("admin", "super_admin"), async (c) => {
    return ok(c, await service.listTransferLocations(c.get("tenantId"), c.req.query("cityId")));
  });
  app.post(
    "/transfer-locations",
    requireRoles("admin", "super_admin"),
    zValidator("json", createTransferLocationSchema),
    async (c) => ok(c, await service.createTransferLocation(c.get("tenantId"), c.req.valid("json")), undefined, 201)
  );

  // --- Usage & billing (spec: multi-tenancy Phase 5) ---
  // Read-only self-service - see TenantService.assignPlan's doc comment
  // for why changing plans itself is a super_admin action, not
  // something exposed here.
  app.get("/tenant/usage", requireRoles("admin", "super_admin"), async (c) => {
    const usage = await tenants.getUsage(c.get("tenantId"));
    return ok(c, usage);
  });

  // --- Custom domain (spec: multi-tenancy Phase 5) ---
  // Self-service - the tenant's own admin manages their own domain,
  // scoped to c.get("tenantId") like everything else in this file (never
  // scopeOrNull: a super_admin acting on behalf of a tenant here still
  // needs to pick which tenant via the same X-Tenant-Id mechanism
  // everything else in this file uses, not a platform-wide "null" mode
  // - a domain always belongs to exactly one tenant).
  app.put(
    "/tenant/domain",
    requireRoles("admin", "super_admin"),
    zValidator("json", setCustomDomainSchema),
    async (c) => {
      const authUser = c.get("authUser");
      const { domain } = c.req.valid("json");
      const result = await tenants.requestCustomDomain(c.get("tenantId"), domain, authUser.sub);
      return ok(c, result);
    }
  );

  app.post("/tenant/domain/verify", requireRoles("admin", "super_admin"), async (c) => {
    const authUser = c.get("authUser");
    const result = await tenants.verifyCustomDomain(c.get("tenantId"), authUser.sub);
    return ok(c, result);
  });

  app.delete("/tenant/domain", requireRoles("admin", "super_admin"), async (c) => {
    const authUser = c.get("authUser");
    await tenants.removeCustomDomain(c.get("tenantId"), authUser.sub);
    return ok(c, { removed: true });
  });

  // --- Notification templates (spec section 20/44) ---
  app.get("/notification-templates", requireRoles("admin", "super_admin", "marketing_manager"), async (c) => {
    return ok(c, await service.listNotificationTemplates(c.get("tenantId")));
  });
  app.put(
    "/notification-templates",
    requireRoles("admin", "super_admin", "marketing_manager"),
    zValidator("json", upsertNotificationTemplateSchema),
    async (c) => ok(c, await service.upsertNotificationTemplate(c.get("tenantId"), c.req.valid("json")))
  );

  return app;
}
