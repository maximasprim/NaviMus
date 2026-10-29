import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { env } from "@travel/config";
import { createServiceLogger } from "@travel/logger";
import { createDb } from "@travel/database";
import { EventPublisher } from "@travel/events";
import { buildErrorHandler, requestIdMiddleware, ok } from "@travel/http";
import { RefreshTokenRepository } from "./repositories/refresh-token-repository.js";
import { UserRepository } from "./repositories/user-repository.js";
import { AuthService } from "./services/auth-service.js";
import { buildAuthRoutes } from "./routes.js";

const logger = createServiceLogger("auth-service");
const db = createDb(env.DATABASE_URL);
const events = new EventPublisher();

const userRepository = new UserRepository(db);
const authService = new AuthService(userRepository, events, new RefreshTokenRepository(db));

export const app = new Hono();
app.use("*", requestIdMiddleware);
app.onError(buildErrorHandler());

app.get("/health", (c) => ok(c, { status: "ok", service: "auth" }));
app.get("/ready", (c) => ok(c, { status: "ready" }));
app.route("/", buildAuthRoutes(authService, userRepository));

// Only boot an HTTP listener when run standalone; when mounted into
// the gateway, the gateway process owns the listener instead.
if (import.meta.url === `file://${process.argv[1]}`) {
  serve({ fetch: app.fetch, port: env.PORT }, (info) => {
    logger.info(`auth service listening on port ${info.port}`);
  });
}
