import { NotFoundError, ValidationError, type Currency } from "@travel/types";
import type { Database } from "@travel/database";
import type { CreateCouponInput, ValidateCouponInput } from "@travel/validation";
import type { CouponRepository } from "../repositories/coupon-repository.js";

export interface CouponEvaluation {
  couponId: string;
  code: string;
  discountAmount: number;
  currency: string;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export class PromotionService {
  constructor(private readonly repo: CouponRepository) {}

  async createCoupon(tenantId: string, input: CreateCouponInput) {
    if (input.discountType === "fixed_amount" && !input.currency) {
      throw new ValidationError("currency is required for fixed_amount coupons");
    }
    return this.repo.create(tenantId, input);
  }

  /**
   * Read-only validity/pricing check - does NOT consume a
   * redemption. Used by the frontend to show "coupon applied"
   * before the customer commits to checkout. The actual atomic
   * consumption happens in `applyCouponTx`, called from inside the
   * Booking service's checkout transaction.
   */
  async evaluate(tenantId: string, input: ValidateCouponInput): Promise<CouponEvaluation> {
    const coupon = await this.repo.findByCode(tenantId, input.code.toUpperCase());
    if (!coupon || !coupon.isActive) {
      throw new NotFoundError("Coupon");
    }

    const today = todayIso();
    if (coupon.validFrom && today < coupon.validFrom) {
      throw new ValidationError("This coupon is not active yet");
    }
    if (coupon.validUntil && today > coupon.validUntil) {
      throw new ValidationError("This coupon has expired");
    }
    if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) {
      throw new ValidationError("This coupon has reached its usage limit");
    }
    if (coupon.minBookingAmount && input.bookingAmount < Number(coupon.minBookingAmount)) {
      throw new ValidationError(`This coupon requires a minimum booking amount of ${coupon.minBookingAmount}`);
    }
    if (coupon.discountType === "fixed_amount" && coupon.currency !== input.currency) {
      throw new ValidationError("This coupon's currency does not match the booking currency");
    }

    const discountAmount =
      coupon.discountType === "percentage"
        ? Math.round(input.bookingAmount * (Number(coupon.discountValue) / 100) * 100) / 100
        : Math.min(Number(coupon.discountValue), input.bookingAmount);

    return { couponId: coupon.id, code: coupon.code, discountAmount, currency: input.currency };
  }

  /**
   * Called by the Booking service inside its checkout transaction:
   * re-validates the coupon (never trust a stale client-side
   * evaluation) and atomically consumes one redemption. Throws if
   * the coupon became invalid or exhausted between evaluate() and
   * checkout - the caller should treat that as "price changed,
   * please retry" rather than silently dropping the discount.
   *
   * `tenantId` is the booking's own tenant - findByCode's tenant
   * filter is what stops one tenant's coupon code from being
   * redeemed against another tenant's booking.
   */
  async applyCouponTx(tx: Database, tenantId: string, code: string, bookingAmount: number, currency: Currency): Promise<CouponEvaluation> {
    const evaluation = await this.evaluate(tenantId, { code, bookingAmount, currency });
    const redeemed = await this.repo.tryRedeem(tx, evaluation.couponId);
    if (!redeemed) {
      throw new ValidationError("This coupon just reached its usage limit - please remove it and try again");
    }
    return evaluation;
  }
}
