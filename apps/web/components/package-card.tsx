import Link from "next/link";
import type { TravelPackage } from "@/lib/api";
import { SceneArt } from "@/components/scene-art";

function referenceCode(id: string): string {
  return id.replace(/-/g, "").slice(0, 8).toUpperCase();
}

export function PackageCard({ pkg }: { pkg: TravelPackage }) {
  const adultPrice = pkg.prices?.find((p) => p.travelerType === "adult");

  return (
    <Link
      href={`/packages/${pkg.slug}`}
      className="group block overflow-hidden rounded-2xl border border-ink-horizon/10 bg-sand-light shadow-card transition hover:-translate-y-1 hover:shadow-card-hover"
    >
      <div className="relative h-24 overflow-hidden">
        <SceneArt seed={pkg.name} className="absolute inset-0 h-full w-full transition duration-500 group-hover:scale-105" />
      </div>
      <div className="flex items-center justify-between bg-ink-horizon px-5 py-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-gold">{pkg.type.replace(/_/g, " ")}</span>
        <span className="font-mono text-[10px] text-sand/50">#{referenceCode(pkg.id)}</span>
      </div>

      <div className="p-5">
        <h3 className="font-display text-xl text-ink-horizon">{pkg.name}</h3>
        {pkg.shortDescription && <p className="mt-2 line-clamp-2 text-sm text-ink/70">{pkg.shortDescription}</p>}

        <div className="mt-4 flex items-center gap-4 font-mono text-xs text-ink/60">
          <span>{pkg.durationDays} DAYS</span>
          <span>·</span>
          <span>
            {pkg.minGroupSize}
            {pkg.maxGroupSize ? `–${pkg.maxGroupSize}` : "+"} TRAVELERS
          </span>
        </div>
      </div>

      <div className="tear-line" />

      <div className="flex items-center justify-between px-5 py-4">
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink/40">From</span>
        {adultPrice ? (
          <span className="font-mono text-lg font-semibold text-acacia">
            {adultPrice.currency} {Number(adultPrice.amount).toLocaleString()}
          </span>
        ) : (
          <span className="font-mono text-sm text-ink/40">See details</span>
        )}
      </div>
    </Link>
  );
}
