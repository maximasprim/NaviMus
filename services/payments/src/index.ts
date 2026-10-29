import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { env } from "@travel/config";
import { createServiceLogger } from "@travel/logger";
import { createDb, createPlanLimitChecker } from "@travel/database";
import { buildErrorHandler, requestIdMiddleware, ok } from "@travel/http";
import { PaymentRepository } from "./repositories/payment-repository.js";
import { SettingsRepository } from "./repositories/settings-repository.js";
import { InvoiceRepository } from "./repositories/invoice-repository.js";
import { PaymentService } from "./services/payment-service.js";
import { buildPaymentRoutes } from "./routes.js";
import { EventPublisher } from "@travel/events";
import { OperatorRepository, OperatorService } from "@travel/service-operators/internal";

const logger = createServiceLogger("payments-service");
const db = createDb(env.DATABASE_URL);

const paymentRepository = new PaymentRepository(db);
const settingsRepository = new SettingsRepository(db);
const invoiceRepository = new InvoiceRepository(db);
const eventPublisher = new EventPublisher();
const paymentService = new PaymentService(db, paymentRepository, settingsRepository, eventPublisher, invoiceRepository);
const operatorService = new OperatorService(new OperatorRepository(db), eventPublisher, createPlanLimitChecker(db));

export const app = new Hono();
app.use("*", requestIdMiddleware);
app.onError(buildErrorHandler());

app.get("/health", (c) => ok(c, { status: "ok", service: "payments" }));
app.get("/ready", (c) => ok(c, { status: "ready" }));
app.route("/", buildPaymentRoutes(paymentService, operatorService));

if (import.meta.url === `file://${process.argv[1]}`) {
  serve({ fetch: app.fetch, port: env.PORT }, (info) => {
    logger.info(`payments service listening on port ${info.port}`);
  });
}
