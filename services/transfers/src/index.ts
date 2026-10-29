import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { env } from "@travel/config";
import { createServiceLogger } from "@travel/logger";
import { createDb } from "@travel/database";
import { buildErrorHandler, requestIdMiddleware, ok } from "@travel/http";
import { TransferRepository } from "./repositories/transfer-repository.js";
import { TransferService } from "./services/transfer-service.js";
import { buildTransferRoutes } from "./routes.js";

const logger = createServiceLogger("transfers-service");
const db = createDb(env.DATABASE_URL);

const transferRepository = new TransferRepository(db);
const transferService = new TransferService(transferRepository);

export const app = new Hono();
app.use("*", requestIdMiddleware);
app.onError(buildErrorHandler());

app.get("/health", (c) => ok(c, { status: "ok", service: "transfers" }));
app.get("/ready", (c) => ok(c, { status: "ready" }));
app.route("/", buildTransferRoutes(transferService));

if (import.meta.url === `file://${process.argv[1]}`) {
  serve({ fetch: app.fetch, port: env.PORT }, (info) => {
    logger.info(`transfers service listening on port ${info.port}`);
  });
}
