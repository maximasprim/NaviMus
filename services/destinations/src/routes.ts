import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  createDestinationSchema,
  destinationSearchQuerySchema,
  updateDestinationSchema,
} from "@travel/validation";
import { ok, paginated } from "@travel/http";
import { requireAuth, requirePermissions } from "@travel/auth";
import type { DestinationService } from "./services/destination-service.js";

export function buildDestinationRoutes(service: DestinationService) {
  const app = new Hono();

  app.get("/", zValidator("query", destinationSearchQuerySchema), async (c) => {
    const query = c.req.valid("query");
    const { items, total, page, pageSize } = await service.search(c.get("tenantId"), query);
    return paginated(c, items, page, pageSize, total);
  });

  app.get("/categories", async (c) => {
    const categories = await service.listCategories(c.get("tenantId"));
    return ok(c, categories);
  });

  // Geography (cities/regions/countries) is shared platform-wide reference
  // data, not tenant-scoped - intentionally no tenantId here.
  app.get("/cities", async (c) => {
    const cities = await service.listCities();
    return ok(c, cities);
  });

  app.get("/:slug", async (c) => {
    const { slug } = c.req.param();
    const destination = await service.getBySlug(c.get("tenantId"), slug);
    return ok(c, destination);
  });

  // --- Admin/operator-managed writes ---
  app.post(
    "/",
    requireAuth,
    requirePermissions("destination:create"),
    zValidator("json", createDestinationSchema),
    async (c) => {
      const input = c.req.valid("json");
      const destination = await service.create(c.get("tenantId"), input);
      return ok(c, destination, undefined, 201);
    }
  );

  app.patch(
    "/:id",
    requireAuth,
    requirePermissions("destination:update"),
    zValidator("json", updateDestinationSchema),
    async (c) => {
      const id = c.req.param("id");
      if (!id) return c.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Missing id" } }, 400);
      const input = c.req.valid("json");
      const destination = await service.update(c.get("tenantId"), id, input);
      return ok(c, destination);
    }
  );

  app.delete("/:id", requireAuth, requirePermissions("destination:delete"), async (c) => {
    const id = c.req.param("id");
    if (!id) return c.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Missing id" } }, 400);
    await service.remove(c.get("tenantId"), id);
    return ok(c, { deleted: true });
  });

  return app;
}
