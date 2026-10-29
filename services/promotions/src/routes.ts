import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { createCouponSchema, validateCouponSchema } from "@travel/validation";
import { ok } from "@travel/http";
import { requireAuth, requireRoles } from "@travel/auth";
import type { PromotionService } from "./services/promotion-service.js";

export function buildPromotionRoutes(service: PromotionService) {
  const app = new Hono();

  app.post("/coupons/validate", zValidator("json", validateCouponSchema), async (c) => {
    const input = c.req.valid("json");
    const evaluation = await service.evaluate(c.get("tenantId"), input);
    return ok(c, evaluation);
  });

  app.post(
    "/coupons",
    requireAuth,
    requireRoles("tour_operator", "admin", "super_admin", "marketing_manager"),
    zValidator("json", createCouponSchema),
    async (c) => {
      const input = c.req.valid("json");
      const coupon = await service.createCoupon(c.get("tenantId"), input);
      return ok(c, coupon, undefined, 201);
    }
  );

  return app;
}
