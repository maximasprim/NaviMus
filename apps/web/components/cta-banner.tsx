import Link from "next/link";
import { safeHref, type Cta } from "@/lib/site-content";

/** All text comes from the tenant's saved site content (Admin -> Site content -> Call to action). */
export function CtaBanner({ heading, body, primary, secondary }: { heading: string; body: string; primary: Cta; secondary: Cta }) {
  return (
    <section className="mx-auto max-w-6xl px-6 py-20">
      <div className="relative overflow-hidden rounded-3xl bg-dawn-fade px-8 py-14 text-center sm:px-16">
        <div className="map-dots absolute inset-0 opacity-20" />
        <div className="relative">
          <h2 className="font-display text-3xl text-sand-light md:text-4xl">{heading}</h2>
          {body && <p className="mx-auto mt-3 max-w-md text-sand-light/80">{body}</p>}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href={safeHref(primary.href)}
              className="rounded-full bg-ink-horizon px-6 py-3 font-body text-sm font-semibold text-sand-light transition hover:bg-ink-horizon/80"
            >
              {primary.label}
            </Link>
            <Link
              href={safeHref(secondary.href)}
              className="rounded-full border border-sand-light/40 px-6 py-3 font-body text-sm font-medium text-sand-light transition hover:border-sand-light/70"
            >
              {secondary.label}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}


// import Link from "next/link";

// export function CtaBanner() {
//   return (
//     <section className="mx-auto max-w-6xl px-6 py-20">
//       <div className="relative overflow-hidden rounded-3xl bg-dawn-fade px-8 py-14 text-center sm:px-16">
//         <div className="map-dots absolute inset-0 opacity-20" />
//         <div className="relative">
//           <h2 className="font-display text-3xl text-sand-light md:text-4xl">Ready to plan the next trip?</h2>
//           <p className="mx-auto mt-3 max-w-md text-sand-light/80">
//             Every package on NaviMus is priced up front - see what's included before you book anything.
//           </p>
//           <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
//             <Link
//               href="/packages"
//               className="rounded-full bg-ink-horizon px-6 py-3 font-body text-sm font-semibold text-sand-light transition hover:bg-ink-horizon/80"
//             >
//               Browse packages
//             </Link>
//             <Link
//               href="/business-signup"
//               className="rounded-full border border-sand-light/40 px-6 py-3 font-body text-sm font-medium text-sand-light transition hover:border-sand-light/70"
//             >
//               List your business
//             </Link>
//           </div>
//         </div>
//       </div>
//     </section>
//   );
// }
