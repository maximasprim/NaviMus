"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { OPEN_TO_ANY_PARTNER, usePartnerState } from "@/lib/partner-state";

const isOpen = (pathname: string) =>
  OPEN_TO_ANY_PARTNER.some((p) => (p === "/" ? pathname === "/" : pathname === p || pathname.startsWith(`${p}/`)));

/**
 * Pages other than the dashboard need an approved operator account. For a partner who is still pending, was
 * rejected, is suspended or hasn't registered yet, show a plain explanation instead of a page full of API errors.
 * A courtesy, not security: the API refuses these calls anyway. If the state can't be determined, the page shows.
 */
export function RouteGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const { info, ready } = usePartnerState();

  if (isOpen(pathname)) return <>{children}</>;
  if (!ready) return null;
  if (info.state === "approved" || info.state === "unknown") return <>{children}</>;

  const text =
    info.state === "unregistered"
      ? "Register your business to start listing packages, accommodation and vehicles."
      : info.state === "pending"
        ? "Your application is being reviewed. These pages unlock as soon as it is approved."
        : "Your operator account isn't active, so these pages are unavailable.";

  return (
    <div className="mx-auto mt-16 max-w-md rounded-2xl border border-gold/40 bg-gold/10 p-8 text-center">
      <p className="text-sm font-semibold text-gold-deep">Not available yet</p>
      <p className="mt-3 text-ink/80">{info.message ?? text}</p>
      <Link
        href={info.state === "unregistered" ? "/register" : "/"}
        className="mt-6 inline-block rounded-full bg-ink-horizon px-5 py-2 text-sm font-medium text-sand-light transition hover:bg-acacia"
      >
        {info.state === "unregistered" ? "Register my business" : "Back to dashboard"}
      </Link>
    </div>
  );
}
