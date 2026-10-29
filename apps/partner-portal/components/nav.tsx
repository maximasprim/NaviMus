import Link from "next/link";
import { SignOutButton } from "./sign-out-button";

export function Nav() {
  return (
    <header className="border-b border-ink-horizon/10 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-baseline gap-2">
          <span className="font-display text-xl text-ink-horizon">NaviMus</span>
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-gold-deep">Partners</span>
        </Link>
        <nav className="flex items-center gap-6 font-body text-sm text-ink/70">
          <Link href="/packages" className="hover:text-ink">
            Packages
          </Link>
          <Link href="/bookings" className="hover:text-ink">
            Bookings
          </Link>
          <Link href="/earnings" className="hover:text-ink">
            Earnings
          </Link>
          <Link href="/reviews" className="hover:text-ink">
            Reviews
          </Link>
          <Link href="/accommodations" className="hover:text-ink">
            Accommodation
          </Link>
          <Link href="/vehicles" className="hover:text-ink">
            Vehicles
          </Link>
          <Link href="/documents" className="hover:text-ink">
            Documents
          </Link>
          <SignOutButton className="text-ink/50 hover:text-ink" />
        </nav>
      </div>
    </header>
  );
}
