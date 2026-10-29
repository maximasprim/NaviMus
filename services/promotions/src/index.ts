import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { env } from "@travel/config";
import { createServiceLogger } from "@travel/logger";
import { createDb } from "@travel/database";
import { buildErrorHandler, requestIdMiddleware, ok } from "@travel/http";
import { CouponRepository } from "./repositories/coupon-repository.js";
import { PromotionService } from "./services/promotion-service.js";
import { buildPromotionRoutes } from "./routes.js";

const logger = createServiceLogger("promotions-service");
const db = createDb(env.DATABASE_URL);

const couponRepository = new CouponRepository(db);
const promotionService = new PromotionService(couponRepository);

export const app = new Hono();
app.use("*", requestIdMiddleware);
app.onError(buildErrorHandler());

app.get("/health", (c) => ok(c, { status: "ok", service: "promotions" }));
app.get("/ready", (c) => ok(c, { status: "ready" }));
app.route("/", buildPromotionRoutes(promotionService));

if (import.meta.url === `file://${process.argv[1]}`) {
  serve({ fetch: app.fetch, port: env.PORT }, (info) => {
    logger.info(`promotions service listening on port ${info.port}`);
  });
}
