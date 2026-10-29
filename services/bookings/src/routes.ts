import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { cancelBookingSchema, createBookingSchema, idempotencyKeySchema } from "@travel/validation";
import { ok, paginated } from "@travel/http";
import { requireAuth, requirePermissions } from "@travel/auth";
import { ValidationError } from "@travel/types";
import { OperatorService } from "@travel/service-operators/internal";
import type { BookingService } from "./services/booking-service.js";

const adminListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.string().optional(),
});

export function buildBookingRoutes(service: BookingService, operators: OperatorService) {
  const app = new Hono();

  app.use("*", requireAuth);

  // Section 44 (admin: manage bookings) - registered BEFORE "/:id" for
  // the same reason "/operator/mine" is below: Hono would otherwise
  // match "admin" as an :id param. tenantId resolves to null for a
  // super_admin (cross-tenant view), or the request's own tenant otherwise.
  app.get("/admin", requirePermissions("booking:view"), zValidator("query", adminListQuerySchema), async (c) => {
    const { page, pageSize, status } = c.req.valid("query");
    const authUser = c.get("authUser");
    const tenantId = authUser.roles.includes("super_admin") ? null : c.get("tenantId");
    const { items, total } = await service.adminListBookings(tenantId, page, pageSize, status as any);
    return paginated(c, items, page, pageSize, total);
  });

  app.get("/admin/:id", requirePermissions("booking:view"), async (c) => {
    const id = c.req.param("id");
    if (!id) return c.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Missing id" } }, 400);
    const authUser = c.get("authUser");
    const tenantId = authUser.roles.includes("super_admin") ? null : c.get("tenantId");
    const booking = await service.adminGetBooking(tenantId, id);
    return ok(c, booking);
  });

  app.patch(
    "/admin/:id/cancel",
    requirePermissions("booking:cancel"),
    zValidator("json", cancelBookingSchema),
    async (c) => {
      const authUser = c.get("authUser");
      const id = c.req.param("id");
      if (!id) return c.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Missing id" } }, 400);
      const { reason } = c.req.valid("json");
      const tenantId = authUser.roles.includes("super_admin") ? null : c.get("tenantId");
      const result = await service.adminCancelBooking(tenantId, id, authUser.sub, reason);
      return ok(c, result);
    }
  );

  app.post("/", zValidator("json", createBookingSchema), async (c) => {
    const idempotencyKeyHeader = c.req.header("idempotency-key");
    const parsedKey = idempotencyKeySchema.safeParse(idempotencyKeyHeader);
    if (!parsedKey.success) {
      throw new ValidationError("A valid Idempotency-Key header is required for booking creation");
    }

    const authUser = c.get("authUser");
    const input = c.req.valid("json");
    const booking = await service.createBooking(c.get("tenantId"), authUser.sub, parsedKey.data, input);
    return ok(c, booking, undefined, 201);
  });

  app.get("/", async (c) => {
    const authUser = c.get("authUser");
    const bookings = await service.listForUser(c.get("tenantId"), authUser.sub);
    return ok(c, bookings);
  });

  // Registered BEFORE "/:id" - otherwise Hono would match "operator" as
  // an :id param and route this to getBookingForUser instead.
  app.get("/operator/mine", async (c) => {
    const authUser = c.get("authUser");
    const tenantId = c.get("tenantId");
    const operator = await operators.resolveOperatorForUser(tenantId, authUser.sub);
    const bookings = await service.listForOperator(tenantId, operator.id);
    return ok(c, bookings);
  });

  app.get("/:id", async (c) => {
    const authUser = c.get("authUser");
    const id = c.req.param("id");
    if (!id) return c.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Missing id" } }, 400);
    const booking = await service.getBookingForUser(c.get("tenantId"), id, authUser.sub);
    return ok(c, booking);
  });

  app.patch("/:id/cancel", zValidator("json", cancelBookingSchema), async (c) => {
    const authUser = c.get("authUser");
    const id = c.req.param("id");
    if (!id) return c.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Missing id" } }, 400);
    const { reason } = c.req.valid("json");
    const result = await service.cancelBooking(c.get("tenantId"), id, authUser.sub, reason);
    return ok(c, result);
  });

  return app;
}
