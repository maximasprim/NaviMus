import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { env } from "@travel/config";
import { createServiceLogger } from "@travel/logger";
import { createDb, createPlanLimitChecker } from "@travel/database";
import { buildErrorHandler, requestIdMiddleware, ok } from "@travel/http";
import { EventPublisher } from "@travel/events";
import { ReviewRepository } from "./repositories/review-repository.js";
import { ReviewService } from "./services/review-service.js";
import { buildReviewRoutes } from "./routes.js";
import { OperatorRepository, OperatorService } from "@travel/service-operators/internal";

const logger = createServiceLogger("reviews-service");
const db = createDb(env.DATABASE_URL);

const reviewRepository = new ReviewRepository(db);
const eventPublisher = new EventPublisher();

const operatorService = new OperatorService(new OperatorRepository(db), new EventPublisher(), createPlanLimitChecker(db));
const resolveOperatorId = async (tenantId: string, userId: string) => (await operatorService.resolveOperatorForUser(tenantId, userId)).id;

const reviewService = new ReviewService(reviewRepository, eventPublisher, resolveOperatorId);

export const app = new Hono();
app.use("*", requestIdMiddleware);
app.onError(buildErrorHandler());

app.get("/health", (c) => ok(c, { status: "ok", service: "reviews" }));
app.get("/ready", (c) => ok(c, { status: "ready" }));
app.route("/", buildReviewRoutes(reviewService));

if (import.meta.url === `file://${process.argv[1]}`) {
  serve({ fetch: app.fetch, port: env.PORT }, (info) => {
    logger.info(`reviews service listening on port ${info.port}`);
  });
}
