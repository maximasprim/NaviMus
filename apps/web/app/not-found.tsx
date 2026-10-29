import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md px-6 py-32 text-center">
      <p className="font-display text-6xl text-gold">404</p>
      <h1 className="mt-2 font-display text-4xl text-ink-horizon">Off the map</h1>
      <p className="mt-3 text-ink/60">We couldn't find that page.</p>
      <Link
        href="/"
        className="mt-6 inline-block rounded-full bg-ink-horizon px-6 py-3 font-body text-sm font-semibold text-sand-light transition hover:bg-acacia"
      >
        Back to home
      </Link>
    </div>
  );
}
