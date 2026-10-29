import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import {
  createTenantSchema,
  listTenantsQuerySchema,
  suspendTenantSchema,
  updateTenantSchema,
  assignPlanSchema,
  hardDeleteTenantSchema,
} from "@travel/validation";
import { ok, paginated } from "@travel/http";
import { requireAuth, requireRoles } from "@travel/auth";
import { NotFoundError } from "@travel/types";
import { runInBypassContext, type Database } from "@travel/database";
import type { BillingService } from "./billing/billing-service.js";
import type { TenantService } from "./services/tenant-service.js";

function requireParam(c: any, name: string): string {
  const value = c.req.param(name);
  if (!value) throw new NotFoundError(name);
  return value;
}

/**
 * Every route here is super_admin only, with no per-route variation -
 * unlike buildAdminRoutes, there's no "or destination_manager" style
 * relaxation, because every operation here acts across or above tenant
 * boundaries (creating a tenant, suspending one, seeing the full list).
 * A regular tenant-scoped admin has no legitimate reason to reach any
 * of this. Mounted at /api/v1/platform, which the gateway's tenant
 * resolution middleware explicitly skips (see apps/api-gateway/src/index.ts)
 * - these operations either don't have a tenant yet or operate across
 * all of them, so there's nothing for it to resolve.
 */
export function buildPlatformRoutes(service: TenantService, db: Database, billing: BillingService) {
  const app = new Hono();

  app.use("*", requireAuth, requireRoles("super_admin"));
  // Platform endpoints are cross-tenant by nature. Row-level security is
  // switched off for the rest of the request - but only HERE, after
  // requireRoles("super_admin") has passed, never before authorisation.
  app.use("*", async (_c, next) => {
    await runInBypassContext(db, async () => {
      await next();
    });
  });

  app.post("/tenants", zValidator("json", createTenantSchema), async (c) => {
    const authUser = c.get("authUser");
    const input = c.req.valid("json");
    const tenant = await service.createTenant(input, authUser.sub);
    return ok(c, tenant, undefined, 201);
  });

  app.get("/tenants", zValidator("query", listTenantsQuerySchema), async (c) => {
    const { page, pageSize, status } = c.req.valid("query");
    const { items, total } = await service.listTenants(page, pageSize, status);
    return paginated(c, items, page, pageSize, total);
  });

  app.get("/tenants/:id", async (c) => {
    const id = requireParam(c, "id");
    const tenant = await service.getTenant(id);
    return ok(c, tenant);
  });

  app.patch("/tenants/:id", zValidator("json", updateTenantSchema), async (c) => {
    const authUser = c.get("authUser");
    const id = requireParam(c, "id");
    const input = c.req.valid("json");
    const tenant = await service.updateTenant(id, input, authUser.sub);
    return ok(c, tenant);
  });

  app.post("/tenants/:id/suspend", zValidator("json", suspendTenantSchema), async (c) => {
    const authUser = c.get("authUser");
    const id = requireParam(c, "id");
    const { reason } = c.req.valid("json");
    const tenant = await service.suspendTenant(id, reason, authUser.sub);
    return ok(c, tenant);
  });

  app.post("/tenants/:id/reactivate", async (c) => {
    const authUser = c.get("authUser");
    const id = requireParam(c, "id");
    const tenant = await service.reactivateTenant(id, authUser.sub);
    return ok(c, tenant);
  });

  // --- Plans (spec: multi-tenancy Phase 5 billing) ---
  app.get("/plans", async (c) => {
    const plans = await service.listPlans();
    return ok(c, plans);
  });

  // Maps a plan to its Stripe price. Verified against Stripe (active, monthly,
  // USD, exactly the plan's price) before it is stored - see BillingService.
  app.patch(
    "/plans/:id/stripe-price",
    zValidator("json", z.object({ stripePriceId: z.string().regex(/^price_[A-Za-z0-9]+$/, "must look like price_xxx").nullable() })),
    async (c) => {
      const authUser = c.get("authUser");
      const { stripePriceId } = c.req.valid("json");
      const plan = await billing.setPlanStripePrice(requireParam(c, "id"), stripePriceId, authUser.sub);
      return ok(c, plan);
    }
  );

  app.patch("/tenants/:id/plan", zValidator("json", assignPlanSchema), async (c) => {
    const authUser = c.get("authUser");
    const id = requireParam(c, "id");
    const { planId } = c.req.valid("json");
    const tenant = await service.assignPlan(id, planId, authUser.sub);
    return ok(c, tenant);
  });

  // --- Data export & hard deletion (spec: multi-tenancy Phase 5) ---
  app.get("/tenants/:id/export", async (c) => {
    const id = requireParam(c, "id");
    const bundle = await service.exportData(id);
    // Content-Disposition so this downloads as a file rather than
    // rendering inline - this is a data export, meant to be saved, not
    // browsed.
    c.header("Content-Disposition", `attachment; filename="tenant-${id}-export.json"`);
    return ok(c, bundle);
  });

  app.delete("/tenants/:id", zValidator("json", hardDeleteTenantSchema), async (c) => {
    const authUser = c.get("authUser");
    const id = requireParam(c, "id");
    const { confirmSlug } = c.req.valid("json");
    await service.hardDelete(id, confirmSlug, authUser.sub);
    return ok(c, { deleted: true });
  });

  return app;
}
