import { describe, it, expect } from "vitest";
import { calculatePackageQuote } from "./quote-engine.js";
import { ValidationError } from "@travel/types";

type PriceRow = Parameters<typeof calculatePackageQuote>[0][number];

function priceRow(overrides: Partial<PriceRow>): PriceRow {
  return {
    id: "price-1",
    packageId: "pkg-1",
    travelerType: "adult",
    pricingType: "individual",
    seasonLabel: null,
    seasonStartDate: null,
    seasonEndDate: null,
    amount: "1000.00",
    currency: "USD",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as PriceRow;
}

describe("calculatePackageQuote", () => {
  it("prices a single adult from the year-round default row", () => {
    const prices = [priceRow({ travelerType: "adult", amount: "1200.00" })];
    const quote = calculatePackageQuote(prices, "2026-09-01", { adult: 1, child: 0, infant: 0 });

    expect(quote.subtotal).toBe(1200);
    expect(quote.currency).toBe("USD");
    expect(quote.lineItems).toHaveLength(1);
    expect(quote.lineItems[0]).toMatchObject({ travelerType: "adult", count: 1, unitPrice: 1200, subtotal: 1200 });
  });

  it("sums multiple traveler types correctly", () => {
    const prices = [
      priceRow({ travelerType: "adult", amount: "1000.00" }),
      priceRow({ travelerType: "child", amount: "600.00" }),
      priceRow({ travelerType: "infant", amount: "0.00" }),
    ];
    const quote = calculatePackageQuote(prices, "2026-09-01", { adult: 2, child: 1, infant: 1 });

    // 2*1000 + 1*600 + 1*0
    expect(quote.subtotal).toBe(2600);
    expect(quote.lineItems).toHaveLength(3);
  });

  it("skips traveler types with a zero count", () => {
    const prices = [priceRow({ travelerType: "adult" }), priceRow({ travelerType: "child", amount: "500.00" })];
    const quote = calculatePackageQuote(prices, "2026-09-01", { adult: 1, child: 0, infant: 0 });

    expect(quote.lineItems).toHaveLength(1);
    expect(quote.lineItems[0]?.travelerType).toBe("adult");
  });

  it("prefers a seasonal price row over the year-round default when the travel date falls inside it", () => {
    const prices = [
      priceRow({ amount: "1000.00" }), // year-round default
      priceRow({
        seasonLabel: "Peak migration",
        seasonStartDate: "2026-07-01",
        seasonEndDate: "2026-10-31",
        amount: "1800.00",
      }),
    ];

    const peakQuote = calculatePackageQuote(prices, "2026-08-15", { adult: 1, child: 0, infant: 0 });
    expect(peakQuote.subtotal).toBe(1800);

    const offSeasonQuote = calculatePackageQuote(prices, "2026-03-01", { adult: 1, child: 0, infant: 0 });
    expect(offSeasonQuote.subtotal).toBe(1000);
  });

  it("does not apply a seasonal row whose date range does not contain the travel date", () => {
    const prices = [
      priceRow({ amount: "1000.00" }),
      priceRow({
        seasonLabel: "Christmas",
        seasonStartDate: "2026-12-15",
        seasonEndDate: "2026-12-31",
        amount: "2500.00",
      }),
    ];
    const quote = calculatePackageQuote(prices, "2026-06-01", { adult: 1, child: 0, infant: 0 });
    expect(quote.subtotal).toBe(1000);
  });

  it("respects pricingType when selecting a price row", () => {
    const prices = [
      priceRow({ pricingType: "individual", amount: "1000.00" }),
      priceRow({ pricingType: "group", amount: "800.00" }),
    ];
    const groupQuote = calculatePackageQuote(prices, "2026-09-01", { adult: 1, child: 0, infant: 0 }, "group");
    expect(groupQuote.subtotal).toBe(800);
  });

  it("throws ValidationError when no price row exists for a requested traveler type", () => {
    const prices = [priceRow({ travelerType: "adult" })];
    expect(() => calculatePackageQuote(prices, "2026-09-01", { adult: 1, child: 2, infant: 0 })).toThrow(
      ValidationError
    );
  });

  it("throws ValidationError when every traveler count is zero", () => {
    const prices = [priceRow({})];
    expect(() => calculatePackageQuote(prices, "2026-09-01", { adult: 0, child: 0, infant: 0 })).toThrow(
      ValidationError
    );
  });

  it("throws ValidationError on mixed currencies across traveler types", () => {
    const prices = [
      priceRow({ travelerType: "adult", currency: "USD", amount: "1000.00" }),
      priceRow({ travelerType: "child", currency: "KES", amount: "50000.00" }),
    ];
    expect(() => calculatePackageQuote(prices, "2026-09-01", { adult: 1, child: 1, infant: 0 })).toThrow(
      ValidationError
    );
  });

  it("rounds subtotals to two decimal places", () => {
    const prices = [priceRow({ amount: "333.333" })];
    const quote = calculatePackageQuote(prices, "2026-09-01", { adult: 3, child: 0, infant: 0 });
    // 333.333 * 3 = 999.999 -> rounds to 1000.00 at the line-item level
    expect(quote.subtotal).toBe(1000);
  });
});
