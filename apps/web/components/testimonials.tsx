import { safeImageUrl, type Testimonial } from "@/lib/site-content";

/** All text comes from the tenant's saved site content (Admin -> Site content -> Testimonials). */
export function Testimonials({ heading, items }: { heading: string; items: Testimonial[] }) {
  if (items.length === 0) return null;
  return (
    <section className="bg-ink-horizon py-20">
      <div className="mx-auto max-w-6xl px-6">
        <div className="max-w-xl">
          <h2 className="font-display text-3xl text-sand-light md:text-4xl">{heading}</h2>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
          {items.map((t, i) => {
            const photo = safeImageUrl(t.photoUrl);
            return (
              <figure key={`${t.name}-${i}`} className="rounded-2xl border border-sand/10 bg-sand-light/5 p-6">
                <blockquote className="font-body text-[15px] leading-relaxed text-sand/80">“{t.quote}”</blockquote>
                <figcaption className="mt-5 flex items-center gap-3 border-t border-sand/10 pt-4 font-mono text-xs text-sand/50">
                  {photo && (
                    // eslint-disable-next-line @next/next/no-img-element -- tenant-supplied https URL
                    <img src={photo} alt="" className="h-8 w-8 rounded-full object-cover" loading="lazy" />
                  )}
                  <span>
                    {t.name}
                    {t.trip ? ` · ${t.trip}` : ""}
                  </span>
                </figcaption>
              </figure>
            );
          })}
        </div>
      </div>
    </section>
  );
}


// const TESTIMONIALS = [
//   {
//     quote:
//       "We booked stays, the transfer from the airport, and a Mara game drive in one go. Nothing to chase up separately once we landed.",
//     name: "Amara O.",
//     trip: "9-day Kenya loop",
//   },
//   {
//     quote:
//       "The itinerary listed exactly what was included before we paid anything. Checkout matched the quote to the shilling.",
//     name: "Brian K.",
//     trip: "Diani beach week",
//   },
//   {
//     quote:
//       "Our connecting stop got rebooked without us noticing a thing when a transfer time changed. That's the part we'd pay for again.",
//     name: "Grace W.",
//     trip: "Naivasha–Amboseli–Mara route",
//   },
// ];

// export function Testimonials() {
//   return (
//     <section className="bg-ink-horizon py-20">
//       <div className="mx-auto max-w-6xl px-6">
//         <div className="max-w-xl">
//           <h2 className="font-display text-3xl text-sand-light md:text-4xl">What travelers say after they're back</h2>
//         </div>

//         <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
//           {TESTIMONIALS.map((t) => (
//             <figure key={t.name} className="rounded-2xl border border-sand/10 bg-sand-light/5 p-6">
//               <blockquote className="font-body text-[15px] leading-relaxed text-sand/80">“{t.quote}”</blockquote>
//               <figcaption className="mt-5 border-t border-sand/10 pt-4 font-mono text-xs text-sand/50">
//                 {t.name} · {t.trip}
//               </figcaption>
//             </figure>
//           ))}
//         </div>
//       </div>
//     </section>
//   );
// }
