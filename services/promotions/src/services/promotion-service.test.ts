import { describe, it, expect, vi } from "vitest";
import { ValidationError, NotFoundError } from "@travel/types";
import { PromotionService } from "./promotion-service.js";
import type { CouponRepository } from "../repositories/coupon-repository.js";

type CouponRow = {
  id: string;
  code: string;
  discountType: "percentage" | "fixed_amount";
  discountValue: string;
  currency: string | null;
  maxUses: number | null;
  usedCount: number;
  minBookingAmount: string | null;
  validFrom: string | null;
  validUntil: string | null;
  isActive: boolean;
};

function coupon(overrides: Partial<CouponRow>): CouponRow {
  return {
    id: "coupon-1",
    code: "SAVE10",
    discountType: "percentage",
    discountValue: "10",
    currency: null,
    maxUses: null,
    usedCount: 0,
    minBookingAmount: null,
    validFrom: null,
    validUntil: null,
    isActive: true,
    ...overrides,
  };
}

const TENANT_ID = "tenant-1";

function fakeRepo(row: CouponRow | null): CouponRepository {
  return {
    findByCode: vi.fn().mockResolvedValue(row),
    create: vi.fn(),
    tryRedeem: vi.fn().mockResolvedValue(true),
  } as unknown as CouponRepository;
}

describe("PromotionService.evaluate", () => {
  it("applies a percentage discount correctly", async () => {
    const service = new PromotionService(fakeRepo(coupon({ discountType: "percentage", discountValue: "15" })));
    const result = await service.evaluate(TENANT_ID, { code: "SAVE10", bookingAmount: 1000, currency: "USD" });
    expect(result.discountAmount).toBe(150);
  });

  it("applies a fixed-amount discount correctly", async () => {
    const service = new PromotionService(
      fakeRepo(coupon({ discountType: "fixed_amount", discountValue: "200", currency: "USD" }))
    );
    const result = await service.evaluate(TENANT_ID, { code: "SAVE10", bookingAmount: 1000, currency: "USD" });
    expect(result.discountAmount).toBe(200);
  });

  it("caps a fixed-amount discount at the booking total, never going negative", async () => {
    const service = new PromotionService(
      fakeRepo(coupon({ discountType: "fixed_amount", discountValue: "5000", currency: "USD" }))
    );
    const result = await service.evaluate(TENANT_ID, { code: "SAVE10", bookingAmount: 100, currency: "USD" });
    expect(result.discountAmount).toBe(100);
  });

  it("throws NotFoundError for a coupon code that doesn't exist", async () => {
    const service = new PromotionService(fakeRepo(null));
    await expect(service.evaluate(TENANT_ID, { code: "NOPE", bookingAmount: 100, currency: "USD" })).rejects.toThrow(
      NotFoundError
    );
  });

  it("throws NotFoundError for a deactivated coupon", async () => {
    const service = new PromotionService(fakeRepo(coupon({ isActive: false })));
    await expect(service.evaluate(TENANT_ID, { code: "SAVE10", bookingAmount: 100, currency: "USD" })).rejects.toThrow(
      NotFoundError
    );
  });

  it("rejects a coupon that hasn't started yet", async () => {
    const farFuture = "2099-01-01";
    const service = new PromotionService(fakeRepo(coupon({ validFrom: farFuture })));
    await expect(service.evaluate(TENANT_ID, { code: "SAVE10", bookingAmount: 100, currency: "USD" })).rejects.toThrow(
      ValidationError
    );
  });

  it("rejects an expired coupon", async () => {
    const longAgo = "2000-01-01";
    const service = new PromotionService(fakeRepo(coupon({ validUntil: longAgo })));
    await expect(service.evaluate(TENANT_ID, { code: "SAVE10", bookingAmount: 100, currency: "USD" })).rejects.toThrow(
      ValidationError
    );
  });

  it("rejects a coupon that has reached its usage limit", async () => {
    const service = new PromotionService(fakeRepo(coupon({ maxUses: 5, usedCount: 5 })));
    await expect(service.evaluate(TENANT_ID, { code: "SAVE10", bookingAmount: 100, currency: "USD" })).rejects.toThrow(
      ValidationError
    );
  });

  it("allows a coupon with uses remaining right up to the limit", async () => {
    const service = new PromotionService(fakeRepo(coupon({ maxUses: 5, usedCount: 4 })));
    await expect(service.evaluate(TENANT_ID, { code: "SAVE10", bookingAmount: 100, currency: "USD" })).resolves.toBeDefined();
  });

  it("rejects a booking below the coupon's minimum amount", async () => {
    const service = new PromotionService(fakeRepo(coupon({ minBookingAmount: "500" })));
    await expect(service.evaluate(TENANT_ID, { code: "SAVE10", bookingAmount: 100, currency: "USD" })).rejects.toThrow(
      ValidationError
    );
  });

  it("rejects a fixed-amount coupon when currencies don't match", async () => {
    const service = new PromotionService(
      fakeRepo(coupon({ discountType: "fixed_amount", discountValue: "50", currency: "KES" }))
    );
    await expect(service.evaluate(TENANT_ID, { code: "SAVE10", bookingAmount: 1000, currency: "USD" })).rejects.toThrow(
      ValidationError
    );
  });
});

describe("PromotionService.applyCouponTx", () => {
  it("re-validates and consumes a redemption when the coupon is valid", async () => {
    const repo = fakeRepo(coupon({ discountType: "percentage", discountValue: "10" }));
    const service = new PromotionService(repo);
    const fakeTx = {} as any;

    const result = await service.applyCouponTx(fakeTx, TENANT_ID, "SAVE10", 1000, "USD");

    expect(result.discountAmount).toBe(100);
    expect(repo.tryRedeem).toHaveBeenCalledWith(fakeTx, "coupon-1");
  });

  it("throws if the coupon was exhausted between evaluation and redemption (race condition)", async () => {
    const repo = fakeRepo(coupon({}));
    (repo.tryRedeem as any).mockResolvedValue(false); // simulates another concurrent checkout winning the last use
    const service = new PromotionService(repo);

    await expect(service.applyCouponTx({} as any, TENANT_ID, "SAVE10", 1000, "USD")).rejects.toThrow(ValidationError);
  });
});
