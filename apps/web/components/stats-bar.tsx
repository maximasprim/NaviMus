import type { Stat } from "@/lib/site-content";

/** `items` come from the tenant's saved site content (Admin -> Site content -> Home page). */
export function StatsBar({ items }: { items: Stat[] }) {
  if (items.length === 0) return null;
  return (
    <section className="border-y border-ink-horizon/10 bg-sand-light">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-8 px-6 py-10 sm:grid-cols-4">
        {items.map((stat, i) => (
          <div key={`${stat.label}-${i}`} className="text-center sm:text-left">
            <p className="font-display text-3xl text-ink-horizon">{stat.value}</p>
            <p className="mt-1 font-body text-sm text-ink/60">{stat.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}


// const STATS = [
//   { value: "40+", label: "Curated itineraries" },
//   { value: "15+", label: "Years in travel planning" },
//   { value: "98%", label: "Trips confirmed on first quote" },
//   { value: "24/7", label: "Support while you travel" },
// ];

// export function StatsBar() {
//   return (
//     <section className="border-y border-ink-horizon/10 bg-sand-light">
//       <div className="mx-auto grid max-w-6xl grid-cols-2 gap-8 px-6 py-10 sm:grid-cols-4">
//         {STATS.map((stat) => (
//           <div key={stat.label} className="text-center sm:text-left">
//             <p className="font-display text-3xl text-ink-horizon">{stat.value}</p>
//             <p className="mt-1 font-body text-sm text-ink/60">{stat.label}</p>
//           </div>
//         ))}
//       </div>
//     </section>
//   );
// }
