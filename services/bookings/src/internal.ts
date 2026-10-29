/**
 * Exposed for the Payment service to call within the same DB
 * transaction that records a payment. See the equivalent note in
 * services/packages/src/internal.ts about the shared-database
 * assumption this relies on and what changes on extraction.
 */
export { transitionBookingStatus } from "./state-machine.js";
export { BookingRepository } from "./repositories/booking-repository.js";
