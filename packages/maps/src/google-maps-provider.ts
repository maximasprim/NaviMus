import type { MapProvider } from "./provider.js";

/** Real implementation, used when MAPS_PROVIDER=google and an API key is configured. */
export class GoogleMapsProvider implements MapProvider {
  readonly name = "google";

  constructor(private readonly apiKey: string) {}

  getStaticMapUrl(input: { latitude: number; longitude: number; zoom?: number; width?: number; height?: number }): string {
    const { latitude, longitude, zoom = 13, width = 600, height = 400 } = input;
    return `https://maps.googleapis.com/maps/api/staticmap?center=${latitude},${longitude}&zoom=${zoom}&size=${width}x${height}&markers=color:red%7C${latitude},${longitude}&key=${this.apiKey}`;
  }

  getEmbedUrl(input: { latitude: number; longitude: number; zoom?: number }): string {
    const { latitude, longitude, zoom = 13 } = input;
    return `https://www.google.com/maps/embed/v1/view?key=${this.apiKey}&center=${latitude},${longitude}&zoom=${zoom}`;
  }

  getDirectionsUrl(input: {
    destinationLatitude: number;
    destinationLongitude: number;
    originLatitude?: number;
    originLongitude?: number;
  }): string {
    const { destinationLatitude, destinationLongitude, originLatitude, originLongitude } = input;
    const origin = originLatitude !== undefined && originLongitude !== undefined ? `${originLatitude},${originLongitude}` : "";
    return `https://www.google.com/maps/dir/?api=1&destination=${destinationLatitude},${destinationLongitude}${origin ? `&origin=${origin}` : ""}`;
  }
}
