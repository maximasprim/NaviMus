import type { MapProvider } from "./provider.js";

/**
 * Keyless default so the platform always has a working map without
 * requiring MAPS_API_KEY to be configured first (same "mock/default
 * that actually works" pattern as the mock payment/notification
 * providers). Uses openstreetmap.org's static "export" embed and the
 * staticmap.openstreetmap.de tile renderer for images - no account, no
 * quota concerns for the traffic this platform expects at this stage.
 */
export class OpenStreetMapProvider implements MapProvider {
  readonly name = "openstreetmap";

  getStaticMapUrl(input: { latitude: number; longitude: number; zoom?: number; width?: number; height?: number }): string {
    const { latitude, longitude, zoom = 13, width = 600, height = 400 } = input;
    return `https://staticmap.openstreetmap.de/staticmap.php?center=${latitude},${longitude}&zoom=${zoom}&size=${width}x${height}&markers=${latitude},${longitude},red-pushpin`;
  }

  getEmbedUrl(input: { latitude: number; longitude: number; zoom?: number }): string {
    const { latitude, longitude, zoom = 13 } = input;
    const delta = 0.2 / Math.max(1, zoom / 10);
    const bbox = [longitude - delta, latitude - delta, longitude + delta, latitude + delta].join(",");
    return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&marker=${latitude},${longitude}`;
  }

  getDirectionsUrl(input: {
    destinationLatitude: number;
    destinationLongitude: number;
    originLatitude?: number;
    originLongitude?: number;
  }): string {
    const { destinationLatitude, destinationLongitude, originLatitude, originLongitude } = input;
    if (originLatitude !== undefined && originLongitude !== undefined) {
      return `https://www.openstreetmap.org/directions?from=${originLatitude}%2C${originLongitude}&to=${destinationLatitude}%2C${destinationLongitude}`;
    }
    return `https://www.openstreetmap.org/?mlat=${destinationLatitude}&mlon=${destinationLongitude}#map=15/${destinationLatitude}/${destinationLongitude}`;
  }
}
