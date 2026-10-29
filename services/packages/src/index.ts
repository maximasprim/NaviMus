import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { env } from "@travel/config";
import { createServiceLogger } from "@travel/logger";
import { createDb, createPlanLimitChecker } from "@travel/database";
import { buildErrorHandler, requestIdMiddleware, ok } from "@travel/http";
import { PackageRepository } from "./repositories/package-repository.js";
import { AvailabilityRepository } from "./repositories/availability-repository.js";
import { PackageService } from "./services/package-service.js";
import { buildPackageRoutes } from "./routes.js";
import { OperatorRepository, OperatorService } from "@travel/service-operators/internal";
import { EventPublisher } from "@travel/events";

const logger = createServiceLogger("packages-service");
const db = createDb(env.DATABASE_URL);

const packageRepository = new PackageRepository(db);
const availabilityRepository = new AvailabilityRepository(db);
const packageService = new PackageService(packageRepository);

const operatorService = new OperatorService(new OperatorRepository(db), new EventPublisher(), createPlanLimitChecker(db));
const resolveOperatorId = async (tenantId: string, userId: string) => (await operatorService.resolveOperatorForUser(tenantId, userId)).id;

export const app = new Hono();
app.use("*", requestIdMiddleware);
app.onError(buildErrorHandler());

app.get("/health", (c) => ok(c, { status: "ok", service: "packages" }));
app.get("/ready", (c) => ok(c, { status: "ready" }));
app.route("/", buildPackageRoutes(packageService, resolveOperatorId));

if (import.meta.url === `file://${process.argv[1]}`) {
  serve({ fetch: app.fetch, port: env.PORT }, (info) => {
    logger.info(`packages service listening on port ${info.port}`);
  });
}
