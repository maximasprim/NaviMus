import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { env } from "@travel/config";
import { createServiceLogger } from "@travel/logger";
import { createDb } from "@travel/database";
import { buildErrorHandler, requestIdMiddleware, ok } from "@travel/http";
import { FavoriteRepository } from "./repositories/favorite-repository.js";
import { SupportTicketRepository } from "./repositories/support-ticket-repository.js";
import { TravelerRepository } from "./repositories/traveler-repository.js";
import { buildAccountRoutes } from "./routes.js";

const logger = createServiceLogger("account-service");
const db = createDb(env.DATABASE_URL);

const favoriteRepository = new FavoriteRepository(db);
const supportTicketRepository = new SupportTicketRepository(db);
const travelerRepository = new TravelerRepository(db);

/**
 * Owns the generic "customer account" concerns that don't belong to
 * any single domain service - favorites/wishlist (section 30), saved
 * traveler profiles (section 31), and support tickets (sections 30 &
 * 44). All three were DB tables with no HTTP surface at all before
 * this service existed.
 */
export const app = new Hono();
app.use("*", requestIdMiddleware);
app.onError(buildErrorHandler());

app.get("/health", (c) => ok(c, { status: "ok", service: "account" }));
app.get("/ready", (c) => ok(c, { status: "ready" }));
app.route("/", buildAccountRoutes(favoriteRepository, supportTicketRepository, travelerRepository));

if (import.meta.url === `file://${process.argv[1]}`) {
  serve({ fetch: app.fetch, port: env.PORT }, (info) => {
    logger.info(`account service listening on port ${info.port}`);
  });
}
