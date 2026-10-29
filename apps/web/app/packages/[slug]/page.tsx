import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getPackage } from "@/lib/api";
import { ApiError } from "@/lib/api-client";
import { getServerSiteUrl, getServerTenantSlug } from "@/lib/tenant-server";
import { SaveButton } from "@/components/save-button";
import { SceneArt } from "@/components/scene-art";
import { safeJsonLd } from "@/lib/json-ld";


function referenceCode(id: string): string {
  return id.replace(/-/g, "").slice(0, 8).toUpperCase();
}

/**
 * Spec section 38 (SEO): per-package title/meta description/canonical/
 * OpenGraph. Falls back to shortDescription/description when the
 * operator hasn't set an explicit seoTitle/seoDescription (both fields
 * already exist on the packages table for when they have).
 */
export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const SITE_URL = getServerSiteUrl(); // this tenant's own origin
  try {
    const pkg = await getPackage(params.slug, await getServerTenantSlug());
    const title = pkg.seoTitle || `${pkg.name} - ${pkg.durationDays}-day package`;
    const description = pkg.seoDescription || pkg.shortDescription || pkg.description?.slice(0, 160);
    const canonical = `${SITE_URL}/packages/${pkg.slug}`;
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

export default async function PackageDetailPage({ params }: { params: { slug: string } }) {
  const SITE_URL = getServerSiteUrl(); // this tenant's own origin
  let pkg;
  try {
    pkg = await getPackage(params.slug, await getServerTenantSlug());
  } catch (err) {
    if (err instanceof ApiError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  const adultPrice = pkg.prices?.find((p) => p.travelerType === "adult");
  const sortedItinerary = [...(pkg.itineraries ?? [])].sort((a, b) => a.dayNumber - b.dayNumber);

  // Spec section 38: TouristTrip structured data (JSON-LD) so search
  // engines can render rich results (price, duration) directly. Kept to
  // fields we actually have - no fabricated ratings/review counts.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "TouristTrip",
    name: pkg.name,
    description: pkg.shortDescription || pkg.description,
    touristType: pkg.type,
    itinerary: sortedItinerary.map((day) => ({
      "@type": "TouristAttraction",
      name: day.title || `Day ${day.dayNumber}`,
      description: day.description,
    })),
    ...(adultPrice
      ? {
          offers: {
            "@type": "Offer",
            price: adultPrice.amount,
            priceCurrency: adultPrice.currency,
            availability: "https://schema.org/InStock",
            url: `${SITE_URL}/packages/${pkg.slug}`,
          },
        }
      : {}),
  };

  return (
    <div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }} />
      <div className="relative overflow-hidden py-16">
        <SceneArt seed={pkg.name} className="absolute inset-0 h-full w-full" />
        <div className="absolute inset-0 bg-ink-horizon/60" />
        <div className="relative mx-auto max-w-4xl px-6">
          <div className="flex items-center justify-between font-mono text-xs uppercase tracking-[0.2em] text-gold">
            <span>{pkg.type.replace(/_/g, " ")}</span>
            <span className="text-sand/40">REF #{referenceCode(pkg.id)}</span>
          </div>
          <h1 className="mt-3 font-display text-5xl text-sand-light">{pkg.name}</h1>
          {pkg.shortDescription && <p className="mt-4 max-w-xl text-sand/70">{pkg.shortDescription}</p>}
          <div className="mt-6 flex flex-wrap gap-4 font-mono text-xs text-sand/60">
            <span>{pkg.durationDays} DAYS</span>
            <span>·</span>
            <span>
              {pkg.minGroupSize}
              {pkg.maxGroupSize ? `–${pkg.maxGroupSize}` : "+"} TRAVELERS
            </span>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-4xl grid-cols-1 gap-12 px-6 py-12 md:grid-cols-3">
        <div className="md:col-span-2">
          <div className="flex justify-end">
            <SaveButton subjectType="package" subjectId={pkg.id} />
          </div>
          {pkg.description && (
            <section>
              <h2 className="font-display text-2xl text-ink-horizon">Overview</h2>
              <p className="mt-3 whitespace-pre-line text-ink/70">{pkg.description}</p>
            </section>
          )}

          {sortedItinerary.length > 0 && (
            <section className="mt-10">
              <h2 className="font-display text-2xl text-ink-horizon">Itinerary</h2>
              <ol className="mt-4 space-y-4 border-l-2 border-gold/40 pl-6">
                {sortedItinerary.map((day) => (
                  <li key={day.dayNumber} className="relative">
                    <span className="absolute -left-[31px] flex h-4 w-4 items-center justify-center rounded-full bg-gold" />
                    <p className="font-mono text-xs uppercase tracking-[0.15em] text-gold-deep">Day {day.dayNumber}</p>
                    {day.title && <p className="mt-1 font-display text-lg text-ink-horizon">{day.title}</p>}
                    {day.description && <p className="mt-1 text-sm text-ink/60">{day.description}</p>}
                  </li>
                ))}
              </ol>
            </section>
          )}

          {(pkg.inclusions?.length || pkg.exclusions?.length) && (
            <section className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2">
              {pkg.inclusions && pkg.inclusions.length > 0 && (
                <div>
                  <h3 className="font-display text-lg text-ink-horizon">Included</h3>
                  <ul className="mt-2 space-y-1 text-sm text-ink/70">
                    {pkg.inclusions.map((i, idx) => (
                      <li key={idx}>✓ {i.label}</li>
                    ))}
                  </ul>
                </div>
              )}
              {pkg.exclusions && pkg.exclusions.length > 0 && (
                <div>
                  <h3 className="font-display text-lg text-ink-horizon">Not included</h3>
                  <ul className="mt-2 space-y-1 text-sm text-ink/50">
                    {pkg.exclusions.map((e, idx) => (
                      <li key={idx}>✕ {e.label}</li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}
        </div>

        {/* Boarding-pass style price/booking summary card */}
        <aside className="h-fit rounded-2xl border border-ink-horizon/10 bg-sand-light shadow-card">
          <div className="bg-ink-horizon px-5 py-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-gold">Price per adult</p>
          </div>
          <div className="p-5">
            {adultPrice ? (
              <p className="font-mono text-3xl font-semibold text-acacia">
                {adultPrice.currency} {Number(adultPrice.amount).toLocaleString()}
              </p>
            ) : (
              <p className="text-ink/50">Contact us for pricing</p>
            )}
            <p className="mt-1 text-xs text-ink/40">Final price confirmed at checkout based on travel date</p>
          </div>
          <div className="tear-line stub-notch relative" />
          <div className="p-5">
            <Link
              href={`/checkout/${pkg.slug}`}
              className="block w-full rounded-full bg-gold px-6 py-3 text-center font-body text-sm font-semibold text-ink-horizon transition hover:bg-gold-soft"
            >
              Check availability
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
