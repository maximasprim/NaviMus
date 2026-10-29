import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { env } from "@travel/config";
import { createServiceLogger } from "@travel/logger";
import { createDb } from "@travel/database";
import { buildErrorHandler, requestIdMiddleware, ok } from "@travel/http";
import { DestinationRepository } from "./repositories/destination-repository.js";
import { DestinationService } from "./services/destination-service.js";
import { buildDestinationRoutes } from "./routes.js";

const logger = createServiceLogger("destinations-service");
const db = createDb(env.DATABASE_URL);

const destinationRepository = new DestinationRepository(db);
const destinationService = new DestinationService(destinationRepository);

export const app = new Hono();
app.use("*", requestIdMiddleware);
app.onError(buildErrorHandler());

app.get("/health", (c) => ok(c, { status: "ok", service: "destinations" }));
app.get("/ready", (c) => ok(c, { status: "ready" }));
app.route("/", buildDestinationRoutes(destinationService));

if (import.meta.url === `file://${process.argv[1]}`) {
  serve({ fetch: app.fetch, port: env.PORT }, (info) => {
    logger.info(`destinations service listening on port ${info.port}`);
  });
}
