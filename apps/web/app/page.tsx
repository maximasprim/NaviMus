import Link from "next/link";
import { RouteHero } from "@/components/route-hero";
import { StatsBar } from "@/components/stats-bar";
import { HowItWorks } from "@/components/how-it-works";
import { Testimonials } from "@/components/testimonials";
import { CtaBanner } from "@/components/cta-banner";
import { DestinationCard } from "@/components/destination-card";
import { PackageCard } from "@/components/package-card";
import { listDestinations, listPackages } from "@/lib/api";
import { getServerTenantSlug } from "@/lib/tenant-server";
import { getSiteContent } from "@/lib/site-content-server";
import { safeImageUrl } from "@/lib/site-content";

export default async function HomePage() {
  const tenantSlug = await getServerTenantSlug();
  // The tenant's saved text (Admin -> Site content). Falls back to the built-in defaults if the API is down.
  const site = await getSiteContent();
  const [destinations, packages] = await Promise.all([
    listDestinations({ featured: true }, tenantSlug).catch(() => []),
    listPackages({ featured: true }, tenantSlug).catch(() => []),
  ]);

  return (
    <>
      <RouteHero
        headline={site.hero.headline}
        subheadline={site.hero.subheadline}
        primaryCta={site.hero.primaryCta}
        secondaryCta={site.hero.secondaryCta}
        stats={site.hero.stats}
        routeStops={site.hero.routeStops}
        videoUrls={site.hero.videoUrls.map(safeImageUrl).filter(Boolean)}
      />
      <StatsBar items={site.stats.items} />

      <section className="mx-auto max-w-7xl px-6 py-20">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-3xl text-ink-horizon md:text-4xl">{site.sections.destinationsHeading}</h2>
            {site.sections.destinationsIntro && <p className="mt-2 max-w-md text-ink/60">{site.sections.destinationsIntro}</p>}
          </div>
          <Link href="/destinations" className="font-body text-sm font-semibold text-acacia hover:text-acacia-soft">
            View all destinations →
          </Link>
        </div>
        {destinations.length === 0 ? (
          <p className="mt-8 text-ink/50">
            No featured destinations yet - check back soon, or browse the full list.
          </p>
        ) : (
          <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {destinations.map((d) => (
              <DestinationCard key={d.id} destination={d} />
            ))}
          </div>
        )}
      </section>

      <HowItWorks heading={site.howItWorks.heading} intro={site.howItWorks.intro} steps={site.howItWorks.steps} />

      <section className="bg-sand-dark/40 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="font-display text-3xl text-ink-horizon md:text-4xl">{site.sections.packagesHeading}</h2>
              {site.sections.packagesIntro && <p className="mt-2 max-w-md text-ink/60">{site.sections.packagesIntro}</p>}
            </div>
            <Link href="/packages" className="font-body text-sm font-semibold text-acacia hover:text-acacia-soft">
              View all packages →
            </Link>
          </div>
          {packages.length === 0 ? (
            <p className="mt-8 text-ink/50">No featured packages yet - check back soon, or browse the full list.</p>
          ) : (
            <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {packages.map((p) => (
                <PackageCard key={p.id} pkg={p} />
              ))}
            </div>
          )}
        </div>
      </section>

      <Testimonials heading={site.testimonials.heading} items={site.testimonials.items} />
      <CtaBanner heading={site.cta.heading} body={site.cta.body} primary={site.cta.primary} secondary={site.cta.secondary} />
    </>
  );
}
