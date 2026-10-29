import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { createReviewSchema, respondToReviewSchema, reviewSearchQuerySchema } from "@travel/validation";
import { ok, paginated } from "@travel/http";
import { requireAuth, requireRoles } from "@travel/auth";
import type { ReviewService } from "./services/review-service.js";

const summaryQuerySchema = z.object({
  subjectType: z.string(),
  subjectId: z.string().uuid(),
});

const moderateSchema = z.object({
  status: z.enum(["published", "pending_moderation", "removed"]),
});

export function buildReviewRoutes(service: ReviewService) {
  const app = new Hono();

  app.get("/", zValidator("query", reviewSearchQuerySchema), async (c) => {
    const query = c.req.valid("query");
    const { items, total, page, pageSize } = await service.search(c.get("tenantId"), query);
    return paginated(c, items, page, pageSize, total);
  });

  app.get("/summary", zValidator("query", summaryQuerySchema), async (c) => {
    const { subjectType, subjectId } = c.req.valid("query");
    const summary = await service.getSummary(c.get("tenantId"), subjectType, subjectId);
    return ok(c, summary);
  });

  // Section 30 (customer dashboard: my reviews). Registered as a
  // distinct literal path rather than a query param on GET "/" so it
  // can never accidentally return someone else's reviews - no other
  // route in this file reads an id/userId from the client and calls
  // this method.
  app.get("/mine", requireAuth, async (c) => {
    const authUser = c.get("authUser");
    const items = await service.listMine(c.get("tenantId"), authUser.sub);
    return ok(c, items);
  });

  app.post("/", requireAuth, zValidator("json", createReviewSchema), async (c) => {
    const authUser = c.get("authUser");
    const input = c.req.valid("json");
    const review = await service.create(c.get("tenantId"), authUser.sub, input);
    return ok(c, review, undefined, 201);
  });

  app.post(
    "/:id/respond",
    requireAuth,
    requireRoles("tour_operator", "admin", "super_admin"),
    zValidator("json", respondToReviewSchema),
    async (c) => {
      const authUser = c.get("authUser");
      const { id } = c.req.param();
      const { response } = c.req.valid("json");
      const review = await service.respond(c.get("tenantId"), id, authUser.sub, authUser.roles, response);
      return ok(c, review);
    }
  );

  app.post("/:id/report", requireAuth, async (c) => {
    const id = c.req.param("id");
    if (!id) return c.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Missing id" } }, 400);
    await service.report(c.get("tenantId"), id);
    return ok(c, { reported: true });
  });

  app.patch(
    "/:id/moderate",
    requireAuth,
    requireRoles("admin", "super_admin", "customer_support"),
    zValidator("json", moderateSchema),
    async (c) => {
      const { id } = c.req.param();
      const { status } = c.req.valid("json");
      const review = await service.moderate(c.get("tenantId"), id, status);
      return ok(c, review);
    }
  );

  return app;
}
