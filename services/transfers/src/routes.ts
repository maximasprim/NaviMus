import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { createAirportTransferSchema, createTransferLocationSchema } from "@travel/validation";
import { z } from "zod";
import { ok } from "@travel/http";
import { requireAuth, requireRoles } from "@travel/auth";
import type { TransferService } from "./services/transfer-service.js";

const searchQuerySchema = z.object({
  pickupLocationId: z.string().uuid().optional(),
  dropoffLocationId: z.string().uuid().optional(),
  cityId: z.string().uuid().optional(),
});

export function buildTransferRoutes(service: TransferService) {
  const app = new Hono();

  app.get("/locations", zValidator("query", searchQuerySchema), async (c) => {
    const { cityId } = c.req.valid("query");
    const locations = await service.searchLocations(c.get("tenantId"), cityId);
    return ok(c, locations);
  });

  app.get("/", zValidator("query", searchQuerySchema), async (c) => {
    const { pickupLocationId, dropoffLocationId } = c.req.valid("query");
    const transfers = await service.searchTransfers(c.get("tenantId"), { pickupLocationId, dropoffLocationId });
    return ok(c, transfers);
  });

  app.get("/:id", async (c) => {
    const { id } = c.req.param();
    const transfer = await service.getTransfer(c.get("tenantId"), id);
    return ok(c, transfer);
  });

  app.post(
    "/locations",
    requireAuth,
    requireRoles("admin", "super_admin", "transport_provider"),
    zValidator("json", createTransferLocationSchema),
    async (c) => {
      const input = c.req.valid("json");
      const location = await service.createLocation(c.get("tenantId"), input);
      return ok(c, location, undefined, 201);
    }
  );

  app.post(
    "/",
    requireAuth,
    requireRoles("admin", "super_admin", "transport_provider"),
    zValidator("json", createAirportTransferSchema),
    async (c) => {
      const input = c.req.valid("json");
      const transfer = await service.createTransfer(c.get("tenantId"), input);
      return ok(c, transfer, undefined, 201);
    }
  );

  return app;
}
