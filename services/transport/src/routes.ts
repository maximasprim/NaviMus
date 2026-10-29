import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { createTransportRouteSchema, createVehicleSchema, transportRouteSearchSchema } from "@travel/validation";
import { ok } from "@travel/http";
import { requireAuth, requireRoles } from "@travel/auth";
import type { TransportService } from "./services/transport-service.js";

export function buildTransportRoutes(
  service: TransportService,
  resolveOperator: (tenantId: string, userId: string) => Promise<{ id: string; businessName: string }>
) {
  const app = new Hono();

  app.get("/routes", zValidator("query", transportRouteSearchSchema), async (c) => {
    const { originCityId, destinationCityId } = c.req.valid("query");
    const routes = await service.searchRoutes(c.get("tenantId"), { originCityId, destinationCityId });
    return ok(c, routes);
  });

  app.get("/routes/:id", async (c) => {
    const { id } = c.req.param();
    const route = await service.getRoute(c.get("tenantId"), id);
    return ok(c, route);
  });

  app.post(
    "/routes",
    requireAuth,
    // tour_operator included for the same reason as /vehicles below -
    // operator approval only ever grants "tour_operator".
    requireRoles("transport_provider", "tour_operator", "admin", "super_admin"),
    zValidator("json", createTransportRouteSchema),
    async (c) => {
      const authUser = c.get("authUser");
      const input = c.req.valid("json");
      const operator = await resolveOperator(c.get("tenantId"), authUser.sub);
      const route = await service.createRoute(c.get("tenantId"), operator.id, operator.businessName, input);
      return ok(c, route, undefined, 201);
    }
  );

  // Global reference lookup (private_car/suv/van/etc) - no auth needed,
  // it's just the options list a "create vehicle" form populates.
  app.get("/vehicle-types", async (c) => {
    const types = await service.listVehicleTypes(c.get("tenantId"));
    return ok(c, types);
  });

  app.get(
    "/vehicles/mine",
    requireAuth,
    requireRoles("transport_provider", "tour_operator", "admin", "super_admin"),
    async (c) => {
      const authUser = c.get("authUser");
      const operator = await resolveOperator(c.get("tenantId"), authUser.sub);
      const vehicles = await service.listMyVehicles(c.get("tenantId"), operator.id, operator.businessName);
      return ok(c, vehicles);
    }
  );

  app.post(
    "/vehicles",
    requireAuth,
    // tour_operator included alongside transport_provider for the same
    // reason as accommodation's create route: operator approval only
    // ever grants "tour_operator" (see services/operators), so
    // transport_provider alone was unreachable by any real operator.
    requireRoles("transport_provider", "tour_operator", "admin", "super_admin"),
    zValidator("json", createVehicleSchema),
    async (c) => {
      const authUser = c.get("authUser");
      const input = c.req.valid("json");
      const operator = await resolveOperator(c.get("tenantId"), authUser.sub);
      const vehicle = await service.addVehicle(c.get("tenantId"), operator.id, operator.businessName, input);
      return ok(c, vehicle, undefined, 201);
    }
  );

  return app;
}
