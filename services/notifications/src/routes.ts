import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { ok, paginated } from "@travel/http";
import { requireAuth } from "@travel/auth";
import type { NotificationLogRepository } from "./repositories/notification-log-repository.js";

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

/**
 * Section 30 (customer dashboard: notifications). The worker
 * (worker.ts) is what actually SENDS notifications and writes
 * `notification_logs` rows - this file only lets a signed-in user
 * read their own log and mark entries read. Every route is scoped to
 * `authUser.sub` so one user can never read or mark another user's
 * notifications (no notification id is trusted from the client alone).
 */
export function buildNotificationRoutes(logs: NotificationLogRepository) {
  const app = new Hono();

  app.get("/", requireAuth, zValidator("query", listQuerySchema), async (c) => {
    const authUser = c.get("authUser");
    const { page, pageSize } = c.req.valid("query");
    const { items, total, unreadCount } = await logs.listForUser(authUser.sub, page, pageSize);
    return paginated(c, items, page, pageSize, total, { unreadCount });
  });

  app.patch("/:id/read", requireAuth, async (c) => {
    const authUser = c.get("authUser");
    const id = c.req.param("id");
    if (!id) return c.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Missing id" } }, 400);
    await logs.markRead(id, authUser.sub);
    return ok(c, { message: "Marked as read" });
  });

  app.post("/read-all", requireAuth, async (c) => {
    const authUser = c.get("authUser");
    await logs.markAllRead(authUser.sub);
    return ok(c, { message: "All notifications marked as read" });
  });

  return app;
}
