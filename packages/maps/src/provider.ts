/**
 * Spec section 43: "Integrate a mapping provider through an
 * abstraction... Do not hardcode Google Maps directly throughout the
 * application." Same shape as the payment/storage/notification provider
 * interfaces elsewhere in this codebase.
 *
 * Deliberately has NO dependency on @travel/config: that package
 * validates backend-only env vars (DATABASE_URL, REDIS_URL, JWT
 * secrets...) at import time, which would crash a browser bundle. This
 * package's provider selection takes plain arguments instead, so it can
 * be imported from apps/web (NEXT_PUBLIC_* env vars) as well as any
 * backend service.
 */
export interface MapProvider {
  readonly name: string;
  /** URL of a static map image centered on the given coordinates - safe to use directly in an <img src>. */
  getStaticMapUrl(input: { latitude: number; longitude: number; zoom?: number; width?: number; height?: number }): string;
  /** URL for an interactive embed (e.g. an <iframe src>). */
  getEmbedUrl(input: { latitude: number; longitude: number; zoom?: number }): string;
  /** URL to open turn-by-turn directions from an (optional) origin to the destination. */
  getDirectionsUrl(input: {
    destinationLatitude: number;
    destinationLongitude: number;
    originLatitude?: number;
    originLongitude?: number;
  }): string;
}

export interface Coordinates {
  latitude: number;
  longitude: number;
}

/**
 * Great-circle distance in kilometers between two points (haversine
 * formula) - provider-independent, used for "nearby attractions" /
 * pickup-dropoff distance estimates without calling any external API.
 */
export function calculateDistanceKm(a: Coordinates, b: Coordinates): number {
  const R = 6371; // Earth radius, km
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);

  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
