"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** Public pages for people who are not signed in yet: no sidebar, just the page. */
const CHROMELESS = ["/login", "/register"];

/** Pages that bring their own full-width canvas and padding (the dashboard). Everything else keeps the original centred column. */
const FULL_BLEED = ["/"];

const matches = (pathname: string, list: string[]) =>
  list.some((p) => (p === "/" ? pathname === "/" : pathname === p || pathname.startsWith(`${p}/`)));

/**
 * App shell: the window is fixed. The sidebar fills it and never moves; only the content area scrolls.
 * `sidebar` is passed in (already rendered on the server) so this client component stays tiny.
 */
export function AppShell({ sidebar, children }: { sidebar: ReactNode; children: ReactNode }) {
  const pathname = usePathname() ?? "";

  if (matches(pathname, CHROMELESS)) {
    return (
      <div className="scroll-light h-screen overflow-y-auto supports-[height:100dvh]:h-dvh">
        <header className="border-b border-ink-horizon/10 bg-white">
          <div className="mx-auto flex max-w-8xl items-center px-3 py-3">
            <Link href="/" className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-gold text-sm font-bold text-ink-horizon" aria-hidden>
                N
              </span>
              <span className="text-[15px] font-semibold tracking-tight text-ink-horizon">NaviMus</span>
              <span className="rounded-md bg-ink-horizon/5 px-1.5 py-0.5 text-[11px] font-medium text-fog">Partners</span>
            </Link>
          </div>
        </header>
        <div className="mx-auto max-w-5xl px-6 py-10">{children}</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden supports-[height:100dvh]:h-dvh">
      {sidebar}
      <div className="scroll-light min-w-0 flex-1 overflow-y-auto">
        {matches(pathname, FULL_BLEED) ? children : <div className="mx-auto max-w-8xl px-3 py-4">{children}</div>}
      </div>
    </div>
  );
}
