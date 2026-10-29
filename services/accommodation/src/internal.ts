/** Exposed for the Booking service to reserve rooms inside its own checkout transaction. See services/packages/src/internal.ts for the shared-database caveat. */
export { AccommodationRepository } from "./repositories/accommodation-repository.js";
export { AccommodationService } from "./services/accommodation-service.js";
