import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  inviteOperatorStaffSchema,
  operatorSearchQuerySchema,
  registerOperatorSchema,
  reviewOperatorDocumentSchema,
  reviewOperatorSchema,
  setCommissionRateSchema,
  submitOperatorDocumentSchema,
  updateOperatorSchema,
} from "@travel/validation";
import { ok, paginated } from "@travel/http";
import { requireAuth, requirePermissions, requireRoles } from "@travel/auth";
import type { OperatorService } from "./services/operator-service.js";

export function buildOperatorRoutes(service: OperatorService) {
  const app = new Hono();

  app.post("/", requireAuth, zValidator("json", registerOperatorSchema), async (c) => {
    const authUser = c.get("authUser");
    const input = c.req.valid("json");
    const operator = await service.register(c.get("tenantId"), authUser.sub, input);
    return ok(c, operator, undefined, 201);
  });

  app.get("/me", requireAuth, async (c) => {
    const authUser = c.get("authUser");
    const operator = await service.resolveOperatorForUser(c.get("tenantId"), authUser.sub);
    return ok(c, operator);
  });

  app.get(
    "/",
    requireAuth,
    requireRoles("admin", "super_admin", "travel_manager"),
    zValidator("query", operatorSearchQuerySchema),
    async (c) => {
      const query = c.req.valid("query");
      const { items, total, page, pageSize } = await service.search(c.get("tenantId"), query);
      return paginated(c, items, page, pageSize, total);
    }
  );

  // Soft-deleted operators (for Restore). Registered BEFORE "/:id" so "deleted" isn't taken as an id.
  app.get("/deleted", requireAuth, requireRoles("admin", "super_admin"), async (c) => ok(c, await service.listDeleted(c.get("tenantId"))));

  app.get("/:id", requireAuth, requireRoles("admin", "super_admin", "travel_manager"), async (c) => {
    const id = c.req.param("id");
    if (!id) return c.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Missing id" } }, 400);
    const operator = await service.getById(c.get("tenantId"), id);
    return ok(c, operator);
  });

  // Full admin view: profile + staff accounts + documents + totals + recent history.
  app.get("/:id/detail", requireAuth, requireRoles("admin", "super_admin", "travel_manager"), async (c) => {
    const id = c.req.param("id");
    if (!id) return c.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Missing id" } }, 400);
    return ok(c, await service.getDetail(c.get("tenantId"), id));
  });

  app.patch("/:id", requireAuth, requireRoles("admin", "super_admin"), zValidator("json", updateOperatorSchema), async (c) => {
    const id = c.req.param("id");
    if (!id) return c.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Missing id" } }, 400);
    const operator = await service.updateProfile(c.get("tenantId"), id, c.req.valid("json"), c.get("authUser").sub);
    return ok(c, operator);
  });

  app.post("/:id/reinstate", requireAuth, requireRoles("admin", "super_admin"), async (c) => {
    const id = c.req.param("id");
    if (!id) return c.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Missing id" } }, 400);
    return ok(c, await service.reinstate(c.get("tenantId"), id, c.get("authUser").sub));
  });

  app.post("/:id/restore", requireAuth, requireRoles("admin", "super_admin"), async (c) => {
    const id = c.req.param("id");
    if (!id) return c.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Missing id" } }, 400);
    return ok(c, await service.restore(c.get("tenantId"), id, c.get("authUser").sub));
  });

  app.delete("/:id", requireAuth, requireRoles("admin", "super_admin"), async (c) => {
    const id = c.req.param("id");
    if (!id) return c.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Missing id" } }, 400);
    await service.remove(c.get("tenantId"), id, c.get("authUser").sub);
    return ok(c, { deleted: true });
  });

  app.delete("/:id/staff/:userId", requireAuth, requireRoles("admin", "super_admin"), async (c) => {
    const id = c.req.param("id");
    const userId = c.req.param("userId");
    if (!id || !userId) return c.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Missing id" } }, 400);
    await service.removeStaff(c.get("tenantId"), id, userId, c.get("authUser").sub);
    return ok(c, { removed: true });
  });

  app.post(
    "/:id/review",
    requireAuth,
    requireRoles("admin", "super_admin"),
    zValidator("json", reviewOperatorSchema),
    async (c) => {
      const id = c.req.param("id");
      if (!id) return c.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Missing id" } }, 400);
      const authUser = c.get("authUser");
      const input = c.req.valid("json");
      const operator = await service.review(c.get("tenantId"), id, input, authUser.sub);
      return ok(c, operator);
    }
  );

  app.post("/:id/suspend", requireAuth, requireRoles("admin", "super_admin"), async (c) => {
    const id = c.req.param("id");
    if (!id) return c.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Missing id" } }, 400);
    const operator = await service.suspend(c.get("tenantId"), id);
    return ok(c, operator);
  });

  app.put(
    "/:id/commission-rate",
    requireAuth,
    requireRoles("admin", "super_admin", "finance_manager"),
    zValidator("json", setCommissionRateSchema),
    async (c) => {
      const id = c.req.param("id");
      if (!id) return c.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Missing id" } }, 400);
      const { commissionRatePercent } = c.req.valid("json");
      const operator = await service.setCommissionRate(c.get("tenantId"), id, commissionRatePercent);
      return ok(c, operator);
    }
  );

  app.post(
    "/:id/staff",
    requireAuth,
    requireRoles("admin", "super_admin"),
    zValidator("json", inviteOperatorStaffSchema),
    async (c) => {
      const id = c.req.param("id");
      if (!id) return c.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Missing id" } }, 400);
      const { userId, title } = c.req.valid("json");
      const staff = await service.addStaff(c.get("tenantId"), id, userId, title);
      return ok(c, staff, undefined, 201);
    }
  );

  app.post(
    "/:id/documents",
    requireAuth,
    zValidator("json", submitOperatorDocumentSchema),
    async (c) => {
      const id = c.req.param("id");
      if (!id) return c.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Missing id" } }, 400);
      const { documentType, storageKey } = c.req.valid("json");
      const document = await service.submitDocument(c.get("tenantId"), id, documentType, storageKey);
      return ok(c, document, undefined, 201);
    }
  );

  app.get("/:id/documents", requireAuth, async (c) => {
    const id = c.req.param("id");
    if (!id) return c.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Missing id" } }, 400);
    const documents = await service.listDocuments(c.get("tenantId"), id);
    return ok(c, documents);
  });

  app.post(
    "/documents/:documentId/review",
    requireAuth,
    requireRoles("admin", "super_admin"),
    zValidator("json", reviewOperatorDocumentSchema),
    async (c) => {
      const { documentId } = c.req.param();
      const authUser = c.get("authUser");
      const { decision } = c.req.valid("json");
      const document = await service.reviewDocument(c.get("tenantId"), documentId, decision, authUser.sub);
      return ok(c, document);
    }
  );

  return app;
}
