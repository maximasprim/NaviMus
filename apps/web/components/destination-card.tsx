import Link from "next/link";
import type { Destination } from "@/lib/api";
import { SceneArt } from "@/components/scene-art";

export function DestinationCard({ destination }: { destination: Destination }) {
  return (
    <Link
      href={`/destinations/${destination.slug}`}
      className="group block overflow-hidden rounded-2xl border border-ink-horizon/10 bg-sand-light shadow-card transition hover:-translate-y-1 hover:shadow-card-hover"
    >
      <div className="relative flex h-36 items-end overflow-hidden p-5">
        <SceneArt seed={destination.name} className="absolute inset-0 h-full w-full transition duration-500 group-hover:scale-105" />
        <h3 className="relative font-display text-2xl text-sand-light drop-shadow-sm">{destination.name}</h3>
      </div>
      <div className="p-5">
        {destination.shortDescription && (
          <p className="line-clamp-2 text-sm text-ink/70">{destination.shortDescription}</p>
        )}
        {destination.bestTimeToVisit && (
          <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.15em] text-gold-deep">
            Best time: {destination.bestTimeToVisit}
          </p>
        )}
      </div>
    </Link>
  );
}
