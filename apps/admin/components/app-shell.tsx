"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** Pages a signed-out visitor can see. They get no sidebar or menus - only the page itself. */
const CHROMELESS = ["/login"];

const isChromeless = (pathname: string) => CHROMELESS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

/**
 * App shell: the window is fixed. The sidebar fills it and never moves; only the content area scrolls.
 * `sidebar` is passed in (already rendered on the server) so this client component stays tiny.
 */
export function AppShell({ sidebar, children }: { sidebar: ReactNode; children: ReactNode }) {
  const pathname = usePathname() ?? "";

  if (isChromeless(pathname)) {
    return (
      <div className="scroll-light h-screen overflow-y-auto supports-[height:100dvh]:h-dvh">
        <header className="border-b border-ink-horizon/10 bg-white">
          <div className="mx-auto flex max-w-8xl items-center px-3 py-3">
            <Link href="/" className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-gold text-sm font-bold text-ink-horizon" aria-hidden>
                N
              </span>
              <span className="text-[15px] font-semibold tracking-tight text-ink-horizon">NaviMus</span>
              <span className="rounded-md bg-ink-horizon/5 px-1.5 py-0.5 text-[11px] font-medium text-fog">Admin</span>
            </Link>
          </div>
        </header>
        {children}
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden supports-[height:100dvh]:h-dvh">
      {sidebar}
      <div className="scroll-light min-w-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
