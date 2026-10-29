import { OpenStreetMapProvider } from "./openstreetmap-provider.js";
import { GoogleMapsProvider } from "./google-maps-provider.js";
import type { MapProvider } from "./provider.js";

export { type MapProvider, type Coordinates, calculateDistanceKm } from "./provider.js";
export { OpenStreetMapProvider } from "./openstreetmap-provider.js";
export { GoogleMapsProvider } from "./google-maps-provider.js";

/**
 * Explicit-argument factory (no @travel/config dependency - see
 * provider.ts's doc comment). Callers pass their own env values:
 *  - backend services: `env.MAPS_PROVIDER`, `env.MAPS_API_KEY`
 *  - apps/web: `process.env.NEXT_PUBLIC_MAPS_PROVIDER`, `NEXT_PUBLIC_MAPS_API_KEY`
 * Falls back to the keyless OpenStreetMap provider whenever "google"/
 * "mapbox" is selected without an API key, same fail-open pattern as
 * @travel/currency's getExchangeRateProvider().
 */
export function getMapProvider(providerName: string | undefined, apiKey: string | undefined): MapProvider {
  if (providerName === "google" && apiKey) {
    return new GoogleMapsProvider(apiKey);
  }
  return new OpenStreetMapProvider();
}
