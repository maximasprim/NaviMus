import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { env } from "@travel/config";
import { createServiceLogger } from "@travel/logger";
import { createDb, createPlanLimitChecker } from "@travel/database";
import { buildErrorHandler, requestIdMiddleware, ok } from "@travel/http";
import { EventPublisher } from "@travel/events";
import { OperatorRepository } from "./repositories/operator-repository.js";
import { OperatorService } from "./services/operator-service.js";
import { buildOperatorRoutes } from "./routes.js";

const logger = createServiceLogger("operators-service");
const db = createDb(env.DATABASE_URL);

const operatorRepository = new OperatorRepository(db);
const eventPublisher = new EventPublisher();
const operatorService = new OperatorService(operatorRepository, eventPublisher, createPlanLimitChecker(db));

export const app = new Hono();
app.use("*", requestIdMiddleware);
app.onError(buildErrorHandler());

app.get("/health", (c) => ok(c, { status: "ok", service: "operators" }));
app.get("/ready", (c) => ok(c, { status: "ready" }));
app.route("/", buildOperatorRoutes(operatorService));

if (import.meta.url === `file://${process.argv[1]}`) {
  serve({ fetch: app.fetch, port: env.PORT }, (info) => {
    logger.info(`operators service listening on port ${info.port}`);
  });
}
