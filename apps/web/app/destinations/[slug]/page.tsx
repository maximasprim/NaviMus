import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDestination } from "@/lib/api";
import { ApiError } from "@/lib/api-client";
import { getServerSiteUrl, getServerTenantSlug } from "@/lib/tenant-server";
import { getMapProvider } from "@travel/maps";
import { SaveButton } from "@/components/save-button";
import { SceneArt } from "@/components/scene-art";
import { safeJsonLd } from "@/lib/json-ld";


/** Spec section 38 (SEO): per-destination title/meta description/canonical/OpenGraph. */
export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const SITE_URL = getServerSiteUrl(); // this tenant's own origin
  try {
    const destination = await getDestination(params.slug, await getServerTenantSlug());
    const title = `${destination.name} - Travel guide`;
    const description = destination.shortDescription;
    const canonical = `${SITE_URL}/destinations/${destination.slug}`;
    return {
      title,
      description,
      alternates: { canonical },
      openGraph: { title, description, url: canonical, type: "website" },
    };
  } catch {
    return {};
  }
}

export default async function DestinationDetailPage({ params }: { params: { slug: string } }) {
  let destination;
  try {
    destination = await getDestination(params.slug, await getServerTenantSlug());
  } catch (err) {
    if (err instanceof ApiError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  // Spec section 38: TouristDestination structured data.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "TouristDestination",
    name: destination.name,
    description: destination.shortDescription,
    ...(destination.latitude != null && destination.longitude != null
      ? { geo: { "@type": "GeoCoordinates", latitude: destination.latitude, longitude: destination.longitude } }
      : {}),
  };

  return (
    <div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }} />
      <div className="relative overflow-hidden py-20">
        <SceneArt seed={destination.name} className="absolute inset-0 h-full w-full" />
        <div className="absolute inset-0 bg-ink-horizon/55" />
        <div className="relative mx-auto max-w-4xl px-6">
          <h1 className="font-display text-5xl text-sand-light">{destination.name}</h1>
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-6 py-12">
        <div className="flex items-start justify-between gap-4">
          {destination.shortDescription ? (
            <p className="text-lg text-ink/80">{destination.shortDescription}</p>
          ) : (
            <span />
          )}
          <SaveButton subjectType="destination" subjectId={destination.id} />
        </div>
        {destination.bestTimeToVisit && (
          <div className="mt-6 inline-block rounded-full bg-plum/10 px-4 py-2 font-mono text-xs uppercase tracking-[0.15em] text-plum">
            Best time to visit: {destination.bestTimeToVisit}
          </div>
        )}

        {destination.latitude != null && destination.longitude != null && (
          <div className="mt-10">
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-ink/50">Location</p>
            <div className="mt-3 overflow-hidden rounded-2xl border border-ink-horizon/20">
              <iframe
                title={`Map of ${destination.name}`}
                src={getMapProvider(process.env.NEXT_PUBLIC_MAPS_PROVIDER, process.env.NEXT_PUBLIC_MAPS_API_KEY).getEmbedUrl(
                  { latitude: destination.latitude, longitude: destination.longitude }
                )}
                className="h-80 w-full border-0"
                loading="lazy"
              />
            </div>
            <a
              href={getMapProvider(process.env.NEXT_PUBLIC_MAPS_PROVIDER, process.env.NEXT_PUBLIC_MAPS_API_KEY).getDirectionsUrl(
                { destinationLatitude: destination.latitude, destinationLongitude: destination.longitude }
              )}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-block text-sm text-acacia underline"
            >
              Get directions
            </a>
          </div>
        )}

        <div className="mt-10 rounded-2xl border border-dashed border-ink-horizon/20 p-8 text-center text-ink/50">
          Packages that include this destination will be listed here once itinerary linking is
          surfaced on this page - for now, browse{" "}
          <a href="/packages" className="text-acacia underline">
            all packages
          </a>
          .
        </div>
      </div>
    </div>
  );
}
