/**
 * These exports are for OTHER SERVICES within this monorepo to
 * import directly (e.g. the Booking service reserving seats in
 * the same DB transaction that creates the booking). This is safe
 * only because all services currently share one Postgres database
 * and one deployable process boundary is not yet enforced.
 *
 * When the Packages service is extracted to its own deployment,
 * this file is deleted and callers switch to HTTP calls against
 * `/api/v1/packages/*` instead - the repository/service layering
 * already in place makes that swap mechanical.
 */
export { AvailabilityRepository } from "./repositories/availability-repository.js";
export { PackageRepository } from "./repositories/package-repository.js";
export { calculatePackageQuote, type TravelerComposition, type Quote } from "./pricing/quote-engine.js";
