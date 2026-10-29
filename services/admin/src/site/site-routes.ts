import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { updateSiteContentSchema, updateSiteIdentitySchema } from "@travel/validation";
import { ok } from "@travel/http";
import { requireAuth, requireRoles } from "@travel/auth";
import type { SiteContentService } from "./site-content-service.js";

/**
 * PUBLIC: what a tenant's storefront should render. Unauthenticated by design (it is the public site's
 * own content), but still tenant-scoped: the gateway resolves the tenant from the request and RLS
 * means this can only ever return that tenant's row.
 */
export function buildPublicSiteRoutes(service: SiteContentService) {
  const app = new Hono();
  app.get("/", async (c) => ok(c, await service.getPublic(c.get("tenantId"))));
  return app;
}

/**
 * ADMIN: edit the current tenant's site. Mounted at /api/v1/admin/site. Tenant admins edit their own
 * tenant; a super_admin edits whichever tenant they have selected in the admin console.
 */
export function buildAdminSiteRoutes(service: SiteContentService) {
  const app = new Hono();
  app.use("*", requireAuth);

  app.get("/", requireRoles("admin", "super_admin"), async (c) => ok(c, await service.getForAdmin(c.get("tenantId"))));

  app.patch(
    "/content",
    requireRoles("admin", "super_admin"),
    zValidator("json", updateSiteContentSchema),
    async (c) => ok(c, await service.updateContent(c.get("tenantId"), c.req.valid("json"), c.get("authUser").sub))
  );

  app.patch(
    "/identity",
    requireRoles("admin", "super_admin"),
    zValidator("json", updateSiteIdentitySchema),
    async (c) => ok(c, await service.updateIdentity(c.get("tenantId"), c.req.valid("json"), c.get("authUser").sub))
  );

  return app;
}
