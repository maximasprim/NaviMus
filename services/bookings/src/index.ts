import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { env } from "@travel/config";
import { createServiceLogger } from "@travel/logger";
import { createDb, createPlanLimitChecker } from "@travel/database";
import { buildErrorHandler, requestIdMiddleware, ok } from "@travel/http";
import { AvailabilityRepository, PackageRepository } from "@travel/service-packages/internal";
import { AccommodationRepository, AccommodationService } from "@travel/service-accommodation/internal";
import { TransportRepository, TransportService } from "@travel/service-transport/internal";
import { TransferRepository, TransferService } from "@travel/service-transfers/internal";
import { CouponRepository, PromotionService } from "@travel/service-promotions/internal";
import { OperatorRepository, OperatorService } from "@travel/service-operators/internal";
import { EventPublisher } from "@travel/events";
import { BookingRepository } from "./repositories/booking-repository.js";
import { CancellationPolicyRepository } from "./repositories/cancellation-policy-repository.js";
import { BookingService } from "./services/booking-service.js";
import { buildBookingRoutes } from "./routes.js";

const logger = createServiceLogger("bookings-service");
const db = createDb(env.DATABASE_URL);

const bookingRepository = new BookingRepository(db);
const packageRepository = new PackageRepository(db);
const availabilityRepository = new AvailabilityRepository(db);
const cancellationPolicyRepository = new CancellationPolicyRepository(db);
const eventPublisher = new EventPublisher();

const accommodationService = new AccommodationService(db, new AccommodationRepository(db));
const transportService = new TransportService(new TransportRepository(db));
const transferService = new TransferService(new TransferRepository(db));
const promotionService = new PromotionService(new CouponRepository(db));
const operatorService = new OperatorService(new OperatorRepository(db), eventPublisher, createPlanLimitChecker(db));

const bookingService = new BookingService(
  db,
  bookingRepository,
  packageRepository,
  availabilityRepository,
  cancellationPolicyRepository,
  eventPublisher,
  accommodationService,
  transportService,
  transferService,
  promotionService,
  createPlanLimitChecker(db)
);

export const app = new Hono();
app.use("*", requestIdMiddleware);
app.onError(buildErrorHandler());

app.get("/health", (c) => ok(c, { status: "ok", service: "bookings" }));
app.get("/ready", (c) => ok(c, { status: "ready" }));
app.route("/", buildBookingRoutes(bookingService, operatorService));

if (import.meta.url === `file://${process.argv[1]}`) {
  serve({ fetch: app.fetch, port: env.PORT }, (info) => {
    logger.info(`bookings service listening on port ${info.port}`);
  });
}

/**
 * Stale-hold reaper: runs every minute, UNCONDITIONALLY - not
 * gated behind the standalone-process check above. This module's
 * top-level code runs whenever anything imports `app` from here,
 * including the API gateway mounting every service into one
 * process for local/simple deployments. Gating this behind the
 * standalone check (as an earlier version of this file did) meant
 * the reaper silently never ran under `pnpm dev:gateway` - the
 * documented default dev path - leaving abandoned PENDING_PAYMENT
 * bookings holding inventory forever. releaseExpiredHolds() is
 * safe to run redundantly from multiple processes (each expired
 * booking is only found and transitioned once), so there's no
 * correctness cost to this being unconditional even if a future
 * split-services deployment also runs it from a standalone process.
 *
 * In production this should still graduate to a dedicated worker
 * process (or a BullMQ repeatable job, matching the pattern
 * already used for reminder scheduling) rather than a bare
 * setInterval riding on whichever process happens to import this
 * module - flagged here rather than treated as done.
 */
setInterval(() => {
  bookingService.releaseExpiredHolds().catch((err) => logger.error({ err }, "Failed to release expired holds"));
}, 60_000);
