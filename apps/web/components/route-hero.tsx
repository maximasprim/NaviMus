import Link from "next/link";
import { SearchBar } from "@/components/search-bar";
import { HeroVideoBackground } from "@/components/hero-video-background";
import { safeHref, type Cta, type Stat } from "@/lib/site-content";

export interface RouteHeroProps {
  /** All of these come from the tenant's saved site content (Admin -> Site content -> Home page). */
  headline: string;
  subheadline: string;
  primaryCta: Cta;
  secondaryCta: Cta;
  stats: Stat[];
  routeStops: string[];
  videoUrls?: string[];
}

/**
 * Where the drawn route's stops sit. The original design had exactly four stops at these four spots; a tenant
 * can now list any number, so stops are spread along the same shape (for four stops the result is identical).
 */
const ROUTE_SHAPE = [
  { x: 60, y: 250 },
  { x: 220, y: 130 },
  { x: 420, y: 70 },
  { x: 630, y: 190 },
];

function placeStops(labels: string[]) {
  const n = labels.length;
  return labels.map((label, i) => {
    const t = n <= 1 ? 0 : i / (n - 1);
    const pos = t * (ROUTE_SHAPE.length - 1);
    const a = Math.min(Math.floor(pos), ROUTE_SHAPE.length - 1);
    const b = Math.min(a + 1, ROUTE_SHAPE.length - 1);
    const f = pos - a;
    return {
      label,
      x: Math.round(ROUTE_SHAPE[a]!.x + (ROUTE_SHAPE[b]!.x - ROUTE_SHAPE[a]!.x) * f),
      y: Math.round(ROUTE_SHAPE[a]!.y + (ROUTE_SHAPE[b]!.y - ROUTE_SHAPE[a]!.y) * f),
    };
  });
}

/**
 * The signature element: a hand-drawn dashed route connecting
 * stops on a stylized map, drawing itself on load. This isn't
 * decoration - it's a literal depiction of what a "package" is in
 * this product: an ordered sequence of destinations
 * (package_destinations.sequence_order in the schema).
 */
export function RouteHero({ headline, subheadline, primaryCta, secondaryCta, stats, routeStops, videoUrls }: RouteHeroProps) {
  const stops = placeStops(routeStops);
  const path = stops.length > 1 ? `M ${stops.map((s) => `${s.x} ${s.y}`).join(" L ")}` : "";
  // The little drifting marker sits about two-thirds along the route; it is skipped for very short routes.
  const markerStop = stops.length >= 3 ? stops[Math.floor(((stops.length - 1) * 2) / 3)] : undefined;
  const headlineLines = headline.split("\n");

  return (
    <section className="relative overflow-hidden">
      <HeroVideoBackground videoUrls={videoUrls} />
      <div className="relative mx-auto grid max-w-7xl grid-cols-1 items-center gap-12 px-4 py-12 md:grid-cols-2 md:py-28">
        <div className="animate-rise-in">
          <h1 className="font-display text-5xl leading-[1.05] text-sand-light md:text-6xl">
            {headlineLines.map((line, i) => (
              <span key={i}>
                {i > 0 && <br />}
                {line}
              </span>
            ))}
          </h1>
          <p className="mt-6 max-w-md font-body text-lg text-sand/70">{subheadline}</p>

          <div className="mt-8">
            <SearchBar />
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href={safeHref(primaryCta.href)}
              className="rounded-full bg-gold px-6 py-3 font-body text-sm font-semibold text-ink-horizon transition hover:bg-gold-soft"
            >
              {primaryCta.label}
            </Link>
            <Link
              href={safeHref(secondaryCta.href)}
              className="rounded-full border border-sand/30 px-6 py-3 font-body text-sm font-medium text-sand-light transition hover:border-sand/60"
            >
              {secondaryCta.label}
            </Link>
          </div>

          {stats.length > 0 && (
            <dl className="mt-12 grid max-w-md grid-cols-3 gap-6 border-t border-sand/15 pt-6">
              {stats.map((stat, i) => (
                <div key={`${stat.label}-${i}`}>
                  <dt className="font-display text-2xl text-sand-light">{stat.value}</dt>
                  <dd className="mt-1 font-body text-xs text-sand/50">{stat.label}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>

        {stops.length > 0 && (
          <div className="relative animate-rise-in rounded-3xl bg-transparent p-4 backdrop-blur-none [animation-delay:150ms]">
            <svg
              viewBox="0 0 700 320"
              className="w-full"
              role="img"
              aria-label={`Illustrative multi-stop route: ${routeStops.join(", ")}`}
            >
              {path && <path d={path} fill="none" strokeWidth="2.5" className="route-line" style={{ stroke: "rgb(var(--c-gold))" }} />}
              {stops.map((s, i) => (
                <g key={`${s.label}-${i}`}>
                  <circle cx={s.x} cy={s.y} r={i === 0 || i === stops.length - 1 ? 7 : 5} style={{ fill: "rgb(var(--c-sand))" }} />
                  <circle
                    cx={s.x}
                    cy={s.y}
                    r={i === 0 || i === stops.length - 1 ? 7 : 5}
                    fill="none"
                    strokeWidth="2"
                    style={{ stroke: "rgb(var(--c-gold))" }}
                  />
                  <text x={s.x} y={s.y - 16} textAnchor="middle" className="font-mono" style={{ fill: "rgb(var(--c-sand))" }} fontSize="12" opacity="0.85">
                    {s.label}
                  </text>
                </g>
              ))}
              {/* A small drifting marker over the final leg - the one
                  non-user-triggered motion moment on the page. */}
              {markerStop && (
                <g className="animate-drift" style={{ transformOrigin: `${markerStop.x}px ${markerStop.y}px` }}>
                  <circle cx={markerStop.x + 90} cy={markerStop.y + 55} r="3" style={{ fill: "rgb(var(--c-sunset))" }} />
                </g>
              )}
            </svg>
          </div>
        )}
      </div>
    </section>
  );
}
