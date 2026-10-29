import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { env } from "@travel/config";
import { createServiceLogger } from "@travel/logger";
import { createDb, createPlanLimitChecker } from "@travel/database";
import { buildErrorHandler, requestIdMiddleware, ok } from "@travel/http";
import { TransportRepository } from "./repositories/transport-repository.js";
import { TransportService } from "./services/transport-service.js";
import { buildTransportRoutes } from "./routes.js";
import { OperatorRepository, OperatorService } from "@travel/service-operators/internal";
import { EventPublisher } from "@travel/events";

const logger = createServiceLogger("transport-service");
const db = createDb(env.DATABASE_URL);

const transportRepository = new TransportRepository(db);
const transportService = new TransportService(transportRepository);

const operatorService = new OperatorService(new OperatorRepository(db), new EventPublisher(), createPlanLimitChecker(db));
const resolveOperator = async (tenantId: string, userId: string) => {
  const operator = await operatorService.resolveOperatorForUser(tenantId, userId);
  return { id: operator.id, businessName: operator.businessName };
};

export const app = new Hono();
app.use("*", requestIdMiddleware);
app.onError(buildErrorHandler());

app.get("/health", (c) => ok(c, { status: "ok", service: "transport" }));
app.get("/ready", (c) => ok(c, { status: "ready" }));
app.route("/", buildTransportRoutes(transportService, resolveOperator));

if (import.meta.url === `file://${process.argv[1]}`) {
  serve({ fetch: app.fetch, port: env.PORT }, (info) => {
    logger.info(`transport service listening on port ${info.port}`);
  });
}
