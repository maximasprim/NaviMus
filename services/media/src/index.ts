import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { env } from "@travel/config";
import { createServiceLogger } from "@travel/logger";
import { buildErrorHandler, requestIdMiddleware, ok } from "@travel/http";
import { MediaService } from "./services/media-service.js";
import { buildMediaRoutes } from "./routes.js";

const logger = createServiceLogger("media-service");
const mediaService = new MediaService();

export const app = new Hono();
app.use("*", requestIdMiddleware);
app.onError(buildErrorHandler());

app.get("/health", (c) => ok(c, { status: "ok", service: "media" }));
app.get("/ready", (c) => ok(c, { status: "ready" }));
app.route("/", buildMediaRoutes(mediaService));

if (import.meta.url === `file://${process.argv[1]}`) {
  serve({ fetch: app.fetch, port: env.PORT }, (info) => {
    logger.info(`media service listening on port ${info.port}`);
  });
}
