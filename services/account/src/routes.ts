import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  favoriteSchema,
  createSupportTicketSchema,
  addSupportMessageSchema,
  updateSupportTicketStatusSchema,
  travelerProfileInputSchema,
  updateTravelerProfileInputSchema,
} from "@travel/validation";
import { ok, paginated } from "@travel/http";
import { requireAuth, requirePermissions } from "@travel/auth";
import { NotFoundError } from "@travel/types";
import type { FavoriteRepository } from "./repositories/favorite-repository.js";
import type { SupportTicketRepository } from "./repositories/support-ticket-repository.js";
import type { TravelerRepository } from "./repositories/traveler-repository.js";

function requireParam(c: any, name: string) {
  const value = c.req.param(name);
  if (!value) throw new NotFoundError(name);
  return value as string;
}

export function buildAccountRoutes(
  favorites: FavoriteRepository,
  tickets: SupportTicketRepository,
  travelers: TravelerRepository
) {
  const app = new Hono();

  // --- Favorites / wishlist (spec section 30) ---
  // No tenant scoping needed: favorites has no tenant_id column (child of
  // users) and every call here is scoped by the caller's own userId, which
  // is itself bound to exactly one tenant.
  app.get("/favorites", requireAuth, async (c) => {
    const authUser = c.get("authUser");
    const items = await favorites.listForUser(c.get("tenantId"), authUser.sub);
    return ok(c, items);
  });

  app.post("/favorites", requireAuth, zValidator("json", favoriteSchema), async (c) => {
    const authUser = c.get("authUser");
    const { subjectType, subjectId } = c.req.valid("json");
    await favorites.add(c.get("tenantId"), authUser.sub, subjectType, subjectId);
    return ok(c, { message: "Added to wishlist" }, undefined, 201);
  });

  app.delete("/favorites", requireAuth, zValidator("json", favoriteSchema), async (c) => {
    const authUser = c.get("authUser");
    const { subjectType, subjectId } = c.req.valid("json");
    await favorites.remove(c.get("tenantId"), authUser.sub, subjectType, subjectId);
    return ok(c, { message: "Removed from wishlist" });
  });

  // --- Saved traveler profiles (spec section 31) ---
  // Same reasoning as favorites - scoped by the caller's own userId.
  app.get("/travelers", requireAuth, async (c) => {
    const authUser = c.get("authUser");
    const items = await travelers.listForOwner(c.get("tenantId"), authUser.sub);
    return ok(c, items);
  });

  app.post("/travelers", requireAuth, zValidator("json", travelerProfileInputSchema), async (c) => {
    const authUser = c.get("authUser");
    const input = c.req.valid("json");
    const traveler = await travelers.create(c.get("tenantId"), authUser.sub, input);
    return ok(c, traveler, undefined, 201);
  });

  app.get("/travelers/:id", requireAuth, async (c) => {
    const authUser = c.get("authUser");
    const id = requireParam(c, "id");
    const traveler = await travelers.getForOwner(c.get("tenantId"), id, authUser.sub);
    if (!traveler) throw new NotFoundError("Traveler profile");
    return ok(c, traveler);
  });

  app.patch("/travelers/:id", requireAuth, zValidator("json", updateTravelerProfileInputSchema), async (c) => {
    const authUser = c.get("authUser");
    const id = requireParam(c, "id");
    const input = c.req.valid("json");
    const traveler = await travelers.update(c.get("tenantId"), id, authUser.sub, input);
    if (!traveler) throw new NotFoundError("Traveler profile");
    return ok(c, traveler);
  });

  app.delete("/travelers/:id", requireAuth, async (c) => {
    const authUser = c.get("authUser");
    const id = requireParam(c, "id");
    await travelers.softDelete(c.get("tenantId"), id, authUser.sub);
    return ok(c, { message: "Traveler profile removed" });
  });

  // --- Support tickets (spec sections 30 & 44) ---
  // Same reasoning again - scoped by the caller's own userId.
  app.get("/support-tickets", requireAuth, async (c) => {
    const authUser = c.get("authUser");
    const items = await tickets.listForUser(authUser.sub);
    return ok(c, items);
  });

  app.post("/support-tickets", requireAuth, zValidator("json", createSupportTicketSchema), async (c) => {
    const authUser = c.get("authUser");
    const { bookingId, subject, message } = c.req.valid("json");
    const ticket = await tickets.create({ userId: authUser.sub, bookingId, subject, firstMessage: message });
    return ok(c, ticket, undefined, 201);
  });

  app.get("/support-tickets/:id", requireAuth, async (c) => {
    const authUser = c.get("authUser");
    const id = requireParam(c, "id");
    const ticket = await tickets.findByIdForUser(id, authUser.sub);
    if (!ticket) throw new NotFoundError("Support ticket");
    const messages = await tickets.getMessages(id);
    return ok(c, { ...ticket, messages });
  });

  app.post("/support-tickets/:id/messages", requireAuth, zValidator("json", addSupportMessageSchema), async (c) => {
    const authUser = c.get("authUser");
    const id = requireParam(c, "id");
    const ticket = await tickets.findByIdForUser(id, authUser.sub);
    if (!ticket) throw new NotFoundError("Support ticket");
    const { message } = c.req.valid("json");
    const created = await tickets.addMessage(id, authUser.sub, message);
    return ok(c, created, undefined, 201);
  });

  // --- Admin: manage any ticket (spec section 44) ---
  // tenantId resolves to null only for a super_admin's cross-tenant view;
  // otherwise every admin action here is confined to the admin's own
  // tenant via SupportTicketRepository's join through users.
  app.get("/admin/support-tickets", requireAuth, requirePermissions("support:manage"), async (c) => {
    const authUser = c.get("authUser");
    const tenantId = authUser.roles.includes("super_admin") ? null : c.get("tenantId");
    const status = c.req.query("status");
    const items = await tickets.listAll(tenantId, status);
    return ok(c, items);
  });

  app.get("/admin/support-tickets/:id", requireAuth, requirePermissions("support:manage"), async (c) => {
    const authUser = c.get("authUser");
    const tenantId = authUser.roles.includes("super_admin") ? null : c.get("tenantId");
    const id = requireParam(c, "id");
    const ticket = await tickets.findById(tenantId, id);
    if (!ticket) throw new NotFoundError("Support ticket");
    const messages = await tickets.getMessages(id);
    return ok(c, { ...ticket, messages });
  });

  app.post(
    "/admin/support-tickets/:id/messages",
    requireAuth,
    requirePermissions("support:manage"),
    zValidator("json", addSupportMessageSchema),
    async (c) => {
      const authUser = c.get("authUser");
      const tenantId = authUser.roles.includes("super_admin") ? null : c.get("tenantId");
      const id = requireParam(c, "id");
      const ticket = await tickets.findById(tenantId, id);
      if (!ticket) throw new NotFoundError("Support ticket");
      const { message } = c.req.valid("json");
      const created = await tickets.addMessage(id, authUser.sub, message);
      return ok(c, created, undefined, 201);
    }
  );

  app.patch(
    "/admin/support-tickets/:id/status",
    requireAuth,
    requirePermissions("support:manage"),
    zValidator("json", updateSupportTicketStatusSchema),
    async (c) => {
      const authUser = c.get("authUser");
      const tenantId = authUser.roles.includes("super_admin") ? null : c.get("tenantId");
      const id = requireParam(c, "id");
      // Confirm the ticket belongs to this admin's tenant before mutating -
      // updateStatus itself has no tenant filter (see its doc comment).
      const ticket = await tickets.findById(tenantId, id);
      if (!ticket) throw new NotFoundError("Support ticket");
      const { status } = c.req.valid("json");
      await tickets.updateStatus(id, status);
      return ok(c, { message: "Status updated" });
    }
  );

  return app;
}
