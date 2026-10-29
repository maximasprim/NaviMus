/** Exposed for the Booking service to apply a coupon inside its own checkout transaction. See services/packages/src/internal.ts for the shared-database caveat. */
export { CouponRepository } from "./repositories/coupon-repository.js";
export { PromotionService, type CouponEvaluation } from "./services/promotion-service.js";
