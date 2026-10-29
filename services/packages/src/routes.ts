import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  availabilityQuerySchema,
  createPackageSchema,
  packageSearchQuerySchema,
  setAvailabilitySchema,
} from "@travel/validation";
import { ok, paginated } from "@travel/http";
import { requireAuth, requireRoles } from "@travel/auth";
import type { PackageService } from "./services/package-service.js";

const quoteQuerySchema = z.object({
  travelDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  adults: z.coerce.number().int().min(0).default(1),
  children: z.coerce.number().int().min(0).default(0),
  infants: z.coerce.number().int().min(0).default(0),
  // Display-only currency conversion for the quote's subtotal (spec
  // section 18/19) - never affects the authoritative subtotal/currency
  // a booking is created against. See PackageService.getQuote.
  displayCurrency: z.string().length(3).optional(),
});

export function buildPackageRoutes(service: PackageService, resolveOperatorId: (tenantId: string, userId: string) => Promise<string>) {
  const app = new Hono();

  app.get("/", zValidator("query", packageSearchQuerySchema), async (c) => {
    const query = c.req.valid("query");
    const { items, total, page, pageSize } = await service.search(c.get("tenantId"), query);
    return paginated(c, items, page, pageSize, total);
  });

  // Registered BEFORE "/:slug" - otherwise Hono would match "mine" as a
  // slug and route this to getBySlug instead. Operator self-service list:
  // includes drafts/pending, unlike the public search above which is
  // published-only.
  app.get("/mine", requireAuth, requireRoles("tour_operator", "admin", "super_admin"), async (c) => {
    const authUser = c.get("authUser");
    const operatorId = await resolveOperatorId(c.get("tenantId"), authUser.sub);
    const packages = await service.listForOperator(c.get("tenantId"), operatorId);
    return ok(c, packages);
  });

  app.get("/:slug", async (c) => {
    const { slug } = c.req.param();
    const pkg = await service.getBySlug(c.get("tenantId"), slug);
    return ok(c, pkg);
  });

  app.get("/:id/availability", zValidator("query", availabilityQuerySchema), async (c) => {
    const { id } = c.req.param();
    const { from, to } = c.req.valid("query");
    const availability = await service.getAvailability(c.get("tenantId"), id, from, to);
    return ok(c, availability);
  });

  /**
   * Authoritative price quote. Never used to seed a client-supplied
   * price back into POST /bookings - the Booking service recomputes
   * this itself server-side at checkout time.
   */
  app.get("/:id/quote", zValidator("query", quoteQuerySchema), async (c) => {
    const { id } = c.req.param();
    const { travelDate, adults, children, infants, displayCurrency } = c.req.valid("query");
    const quote = await service.getQuote(
      c.get("tenantId"),
      id,
      travelDate,
      { adult: adults, child: children, infant: infants },
      displayCurrency?.toUpperCase()
    );
    return ok(c, quote);
  });

  // --- Operator/admin-managed writes ---
  app.post("/", requireAuth, requireRoles("tour_operator", "admin", "super_admin"), zValidator("json", createPackageSchema), async (c) => {
    const input = c.req.valid("json");
    const authUser = c.get("authUser");
    // Resolved via the Operators service rather than trusting the caller's
    // own user id - see resolveOperatorForUser's doc comment for why.
    const operatorId = await resolveOperatorId(c.get("tenantId"), authUser.sub);
    const pkg = await service.create(input, operatorId, c.get("tenantId"));
    return ok(c, pkg, undefined, 201);
  });

  app.put(
    "/:id/availability",
    requireAuth,
    requireRoles("tour_operator", "admin", "super_admin"),
    zValidator("json", setAvailabilitySchema),
    async (c) => {
      const { id } = c.req.param();
      const { travelDate, totalCapacity } = c.req.valid("json");
      const availability = await service.setAvailability(c.get("tenantId"), id, travelDate, totalCapacity);
      return ok(c, availability);
    }
  );

  app.delete("/:id", requireAuth, requireRoles("tour_operator", "admin", "super_admin"), async (c) => {
    const id = c.req.param("id");
    if (!id) return c.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Missing id" } }, 400);
    await service.remove(c.get("tenantId"), id);
    return ok(c, { deleted: true });
  });

  return app;
}
