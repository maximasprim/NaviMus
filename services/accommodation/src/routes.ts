import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  accommodationSearchQuerySchema,
  createAccommodationSchema,
  createRoomTypeSchema,
  roomAvailabilityQuerySchema,
} from "@travel/validation";
import { ok, paginated } from "@travel/http";
import { requireAuth, requireRoles } from "@travel/auth";
import type { AccommodationService } from "./services/accommodation-service.js";

export function buildAccommodationRoutes(
  service: AccommodationService,
  resolveOperatorId: (tenantId: string, userId: string) => Promise<string>
) {
  const app = new Hono();

  app.get("/", zValidator("query", accommodationSearchQuerySchema), async (c) => {
    const query = c.req.valid("query");
    const { items, total, page, pageSize } = await service.search(c.get("tenantId"), query);
    return paginated(c, items, page, pageSize, total);
  });

  // Registered BEFORE "/:id" - otherwise Hono would match "mine" as an
  // :id param and route it to getById instead (same pitfall as
  // "/operator/mine" in the bookings service).
  app.get(
    "/mine",
    requireAuth,
    requireRoles("accommodation_provider", "tour_operator", "admin", "super_admin"),
    async (c) => {
      const authUser = c.get("authUser");
      const operatorId = await resolveOperatorId(c.get("tenantId"), authUser.sub);
      const items = await service.listForOperator(c.get("tenantId"), operatorId);
      return ok(c, items);
    }
  );

  app.get("/:id", async (c) => {
    const { id } = c.req.param();
    const accommodation = await service.getById(c.get("tenantId"), id);
    return ok(c, accommodation);
  });

  app.get("/room-types/:roomTypeId/availability", zValidator("query", roomAvailabilityQuerySchema), async (c) => {
    const { roomTypeId } = c.req.param();
    const { checkIn, checkOut } = c.req.valid("query");
    const availability = await service.checkAvailability(c.get("tenantId"), roomTypeId, checkIn, checkOut, 1);
    return ok(c, availability);
  });

  app.post(
    "/",
    requireAuth,
    // tour_operator is included alongside accommodation_provider: operator
    // approval (services/operators) only ever grants "tour_operator" - see
    // its doc comment - so gating this on accommodation_provider alone
    // meant no operator created through the normal approval flow could
    // ever actually reach this endpoint. This platform models "operator"
    // as one business entity that can offer any combination of services,
    // not three separately-provisioned role types.
    requireRoles("accommodation_provider", "tour_operator", "admin", "super_admin"),
    zValidator("json", createAccommodationSchema),
    async (c) => {
      const authUser = c.get("authUser");
      const input = c.req.valid("json");
      const operatorId = await resolveOperatorId(c.get("tenantId"), authUser.sub);
      const accommodation = await service.create(c.get("tenantId"), operatorId, input);
      return ok(c, accommodation, undefined, 201);
    }
  );

  app.post(
    "/:id/room-types",
    requireAuth,
    requireRoles("accommodation_provider", "tour_operator", "admin", "super_admin"),
    zValidator("json", createRoomTypeSchema),
    async (c) => {
      const { id } = c.req.param();
      const input = c.req.valid("json");
      const roomType = await service.addRoomType(c.get("tenantId"), id, input);
      return ok(c, roomType, undefined, 201);
    }
  );

  return app;
}
