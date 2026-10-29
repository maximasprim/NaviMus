import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { env } from "@travel/config";
import { createServiceLogger } from "@travel/logger";
import { createDb } from "@travel/database";
import { buildErrorHandler, requestIdMiddleware, ok } from "@travel/http";
import { NotificationLogRepository } from "./repositories/notification-log-repository.js";
import { buildNotificationRoutes } from "./routes.js";

const logger = createServiceLogger("notifications-service");
const db = createDb(env.DATABASE_URL);
const logs = new NotificationLogRepository(db);

/**
 * The Notification service is primarily queue-driven - see worker.ts
 * for where sending actually happens - but the customer-facing inbox
 * (section 30: notifications) needs a normal read/write HTTP API too,
 * so this app is no longer health-check-only.
 */
export const app = new Hono();
app.use("*", requestIdMiddleware);
app.onError(buildErrorHandler());

app.get("/health", (c) => ok(c, { status: "ok", service: "notifications" }));
app.get("/ready", (c) => ok(c, { status: "ready" }));
app.route("/", buildNotificationRoutes(logs));

if (import.meta.url === `file://${process.argv[1]}`) {
  serve({ fetch: app.fetch, port: env.PORT }, (info) => {
    logger.info(`notifications service listening on port ${info.port}`);
  });
}
