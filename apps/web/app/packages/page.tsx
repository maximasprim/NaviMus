import { PackageCard } from "@/components/package-card";
import { SearchBar } from "@/components/search-bar";
import { listPackages } from "@/lib/api";
import { getServerTenantSlug } from "@/lib/tenant-server";

export default async function PackagesPage({ searchParams }: { searchParams: { q?: string } }) {
  const q = searchParams?.q?.trim() || undefined;
  const packages = await listPackages({ q }, await getServerTenantSlug()).catch(() => []);

  return (
    <div className="mx-auto max-w-6xl px-6 py-16">
      <div className="flex flex-col gap-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-4xl text-ink-horizon">Complete itineraries</h1>
          <p className="mt-3 max-w-xl text-ink/60">
            Stays, transport, and transfers bundled and priced up front - pick one and check availability.
          </p>
        </div>
        <SearchBar />
      </div>

      {q && (
        <p className="mt-6 font-mono text-xs uppercase tracking-[0.15em] text-ink/50">
          Showing results for “{q}”
        </p>
      )}

      {packages.length === 0 ? (
        <div className="mt-12 rounded-2xl border border-dashed border-ink-horizon/20 p-12 text-center text-ink/50">
          {q ? `No packages match "${q}" yet - try browsing all packages.` : "No packages published yet."}
        </div>
      ) : (
        <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {packages.map((p) => (
            <PackageCard key={p.id} pkg={p} />
          ))}
        </div>
      )}
    </div>
  );
}
