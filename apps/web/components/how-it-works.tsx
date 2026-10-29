import type { Step } from "@/lib/site-content";

/** All text comes from the tenant's saved site content (Admin -> Site content -> Home page). */
export function HowItWorks({ heading, intro, steps }: { heading: string; intro: string; steps: Step[] }) {
  if (steps.length === 0) return null;
  return (
    <section className="mx-auto max-w-6xl px-6 py-20">
      <div className="max-w-xl">
        <h2 className="font-display text-3xl text-ink-horizon md:text-4xl">{heading}</h2>
        {intro && <p className="mt-3 text-ink/60">{intro}</p>}
      </div>

      <ol className="mt-12 grid grid-cols-1 gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((step, i) => (
          <li key={`${step.title}-${i}`} className="relative pl-14">
            <span className="absolute left-0 top-0 flex h-10 w-10 items-center justify-center rounded-full bg-ink-horizon font-display text-lg text-sand-light">
              {i + 1}
            </span>
            <h3 className="font-display text-lg text-ink-horizon">{step.title}</h3>
            <p className="mt-2 text-sm text-ink/60">{step.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

// const STEPS = [
//   {
//     title: "Pick a route",
//     body: "Browse complete itineraries or start from a single destination - each one shows exactly what's included.",
//   },
//   {
//     title: "Check the real price",
//     body: "Add your travel dates and group size for a live quote. No placeholder pricing, no surprise fees at checkout.",
//   },
//   {
//     title: "Book in one step",
//     body: "Stays, transport, and transfers are reserved together, confirmed the moment payment clears.",
//   },
//   {
//     title: "Travel with support",
//     body: "Your itinerary and booking reference travel with you - reach support any time before or during the trip.",
//   },
// ];

// export function HowItWorks() {
//   return (
//     <section className="mx-auto max-w-6xl px-6 py-20">
//       <div className="max-w-xl">
//         <h2 className="font-display text-3xl text-ink-horizon md:text-4xl">Booking a multi-stop trip, simplified</h2>
//         <p className="mt-3 text-ink/60">
//           Four steps stand between browsing and boarding - no separate bookings to reconcile.
//         </p>
//       </div>

//       <ol className="mt-12 grid grid-cols-1 gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
//         {STEPS.map((step, i) => (
//           <li key={step.title} className="relative pl-14">
//             <span className="absolute left-0 top-0 flex h-10 w-10 items-center justify-center rounded-full bg-ink-horizon font-display text-lg text-sand-light">
//               {i + 1}
//             </span>
//             <h3 className="font-display text-lg text-ink-horizon">{step.title}</h3>
//             <p className="mt-2 text-sm text-ink/60">{step.body}</p>
//           </li>
//         ))}
//       </ol>
//     </section>
//   );
// }
