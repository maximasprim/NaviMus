import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { env } from "@travel/config";
import { createServiceLogger } from "@travel/logger";
import { createDb, createPlanLimitChecker } from "@travel/database";
import { buildErrorHandler, requestIdMiddleware, ok } from "@travel/http";
import { AccommodationRepository } from "./repositories/accommodation-repository.js";
import { AccommodationService } from "./services/accommodation-service.js";
import { buildAccommodationRoutes } from "./routes.js";
import { OperatorRepository, OperatorService } from "@travel/service-operators/internal";
import { EventPublisher } from "@travel/events";

const logger = createServiceLogger("accommodation-service");
const db = createDb(env.DATABASE_URL);

const accommodationRepository = new AccommodationRepository(db);
const accommodationService = new AccommodationService(db, accommodationRepository);

const operatorService = new OperatorService(new OperatorRepository(db), new EventPublisher(), createPlanLimitChecker(db));
const resolveOperatorId = async (tenantId: string, userId: string) => (await operatorService.resolveOperatorForUser(tenantId, userId)).id;

export const app = new Hono();
app.use("*", requestIdMiddleware);
app.onError(buildErrorHandler());

app.get("/health", (c) => ok(c, { status: "ok", service: "accommodation" }));
app.get("/ready", (c) => ok(c, { status: "ready" }));
app.route("/", buildAccommodationRoutes(accommodationService, resolveOperatorId));

if (import.meta.url === `file://${process.argv[1]}`) {
  serve({ fetch: app.fetch, port: env.PORT }, (info) => {
    logger.info(`accommodation service listening on port ${info.port}`);
  });
}
