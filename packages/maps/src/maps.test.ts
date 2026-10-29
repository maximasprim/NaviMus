import { describe, it, expect } from "vitest";
import { calculateDistanceKm } from "./provider.js";
import { OpenStreetMapProvider } from "./openstreetmap-provider.js";
import { getMapProvider } from "./index.js";
import { GoogleMapsProvider } from "./google-maps-provider.js";

describe("calculateDistanceKm", () => {
  it("returns 0 for identical coordinates", () => {
    const p = { latitude: -1.286389, longitude: 36.817223 };
    expect(calculateDistanceKm(p, p)).toBe(0);
  });

  it("approximates the Nairobi -> Mombasa distance (~440km)", () => {
    const nairobi = { latitude: -1.286389, longitude: 36.817223 };
    const mombasa = { latitude: -4.043477, longitude: 39.658871 };
    const km = calculateDistanceKm(nairobi, mombasa);
    expect(km).toBeGreaterThan(400);
    expect(km).toBeLessThan(480);
  });
});

describe("OpenStreetMapProvider", () => {
  const provider = new OpenStreetMapProvider();
  const point = { latitude: -1.286389, longitude: 36.817223 };

  it("builds a static map URL containing the coordinates", () => {
    const url = provider.getStaticMapUrl(point);
    expect(url).toContain("-1.286389,36.817223");
  });

  it("builds an embed URL containing a marker", () => {
    const url = provider.getEmbedUrl(point);
    expect(url).toContain("marker=-1.286389");
  });

  it("builds a directions URL without an origin", () => {
    const url = provider.getDirectionsUrl({ destinationLatitude: point.latitude, destinationLongitude: point.longitude });
    expect(url).toContain("mlat=-1.286389");
  });
});

describe("getMapProvider", () => {
  it("falls back to OpenStreetMap when google is selected without an api key", () => {
    const provider = getMapProvider("google", undefined);
    expect(provider).toBeInstanceOf(OpenStreetMapProvider);
  });

  it("uses GoogleMapsProvider when google is selected with an api key", () => {
    const provider = getMapProvider("google", "test-key");
    expect(provider).toBeInstanceOf(GoogleMapsProvider);
  });

  it("defaults to OpenStreetMap for an unset provider", () => {
    expect(getMapProvider(undefined, undefined)).toBeInstanceOf(OpenStreetMapProvider);
  });
});
