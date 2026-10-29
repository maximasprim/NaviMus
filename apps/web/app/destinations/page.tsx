import { DestinationCard } from "@/components/destination-card";
import { listDestinations } from "@/lib/api";
import { getServerTenantSlug } from "@/lib/tenant-server";

export default async function DestinationsPage() {
  const destinations = await listDestinations({}, await getServerTenantSlug()).catch(() => []);

  return (
    <div className="mx-auto max-w-6xl px-6 py-16">
      <h1 className="font-display text-4xl text-ink-horizon">Where to next</h1>
      <p className="mt-3 max-w-xl text-ink/60">
        Wildlife reserves, coastline, and everything worth building an itinerary around.
      </p>

      {destinations.length === 0 ? (
        <div className="mt-12 rounded-2xl border border-dashed border-ink-horizon/20 p-12 text-center text-ink/50">
          No destinations published yet.
        </div>
      ) : (
        <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {destinations.map((d) => (
            <DestinationCard key={d.id} destination={d} />
          ))}
        </div>
      )}
    </div>
  );
}
