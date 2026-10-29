import { beforeAll, describe, expect, it } from "vitest";
import { apiRequest, waitForGateway } from "./client.js";
import { SEED_PACKAGE_SLUG, daysFromNow } from "./fixtures.js";

describe("catalog: destinations and packages", () => {
  beforeAll(async () => {
    await waitForGateway();
  });

  it("lists featured destinations, including the seeded Maasai Mara entry", async () => {
    const res = await apiRequest<Array<{ slug: string }>>("/api/v1/destinations?featured=true");
    expect(res.success).toBe(true);
    expect(res.data?.some((d) => d.slug === "maasai-mara-national-reserve")).toBe(true);
  });

  it("fetches the seeded demo package by slug with its itinerary and prices", async () => {
    const res = await apiRequest<{ name: string; itineraries: unknown[]; prices: unknown[] }>(
      `/api/v1/packages/${SEED_PACKAGE_SLUG}`
    );
    expect(res.success).toBe(true);
    expect(res.data?.name).toContain("Maasai Mara");
    expect(res.data?.itineraries.length).toBeGreaterThan(0);
    expect(res.data?.prices.length).toBeGreaterThan(0);
  });

  it("returns a server-computed quote that matches the seeded price for 2 adults", async () => {
    const pkgRes = await apiRequest<{ id: string }>(`/api/v1/packages/${SEED_PACKAGE_SLUG}`);
    const packageId = pkgRes.data!.id;
    const travelDate = daysFromNow(10);

    const quoteRes = await apiRequest<{ subtotal: number; currency: string }>(
      `/api/v1/packages/${packageId}/quote?travelDate=${travelDate}&adults=2&children=0&infants=0`
    );
    expect(quoteRes.success).toBe(true);
    // Seeded adult price is 650.00 USD - two adults should be exactly double.
    expect(quoteRes.data?.subtotal).toBe(1300);
    expect(quoteRes.data?.currency).toBe("USD");
  });

  it("404s for a package slug that doesn't exist, in the standard error envelope", async () => {
    const res = await apiRequest("/api/v1/packages/does-not-exist-slug");
    expect(res.status).toBe(404);
    expect(res.error?.code).toBe("NOT_FOUND");
  });
});
