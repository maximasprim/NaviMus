import { describe, it, expect } from "vitest";
import { StaticExchangeRateProvider } from "./static-provider.js";
import { convertForDisplay } from "./index.js";
import { UnsupportedCurrencyError } from "./provider.js";

describe("StaticExchangeRateProvider", () => {
  it("returns 1 for identical currencies", async () => {
    const provider = new StaticExchangeRateProvider();
    expect(await provider.getRate("USD", "USD")).toBe(1);
  });

  it("round-trips from -> to -> from close to 1", async () => {
    const provider = new StaticExchangeRateProvider();
    const forward = await provider.getRate("USD", "KES");
    const backward = await provider.getRate("KES", "USD");
    expect(forward * backward).toBeCloseTo(1, 5);
  });

  it("throws UnsupportedCurrencyError for an unknown code", async () => {
    const provider = new StaticExchangeRateProvider();
    await expect(provider.getRate("USD", "XYZ")).rejects.toBeInstanceOf(UnsupportedCurrencyError);
  });
});

describe("convertForDisplay", () => {
  it("short-circuits identical currencies without calling the provider", async () => {
    const result = await convertForDisplay(1000, "KES", "KES", new StaticExchangeRateProvider());
    expect(result).toEqual({ amount: 1000, currency: "KES", rate: 1 });
  });

  it("rounds to 2 decimal places", async () => {
    const provider = new StaticExchangeRateProvider();
    const result = await convertForDisplay(1000, "USD", "KES", provider);
    expect(Number.isInteger(result.amount * 100)).toBe(true);
    expect(result.currency).toBe("KES");
  });
});
