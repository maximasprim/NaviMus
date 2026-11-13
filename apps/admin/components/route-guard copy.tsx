"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { can, homeFor, useAccess } from "@/lib/access";
import { ruleForPath } from "@/lib/access-rules";

/**
 * Shows a friendly "no access" screen instead of a page the signed-in role can't use, so nobody lands on a wall of
 * API errors after typing or bookmarking a URL. Page rules come from the same table as the sidebar.
 *
 * This is a courtesy, not security: the API refuses everything the role can't do regardless. If we can't tell who is
 * signed in, the page is shown (as it was before roles) and the API decides.
 */
export function RouteGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const { access, ready } = useAccess();
  const rule = ruleForPath(pathname);

  if (!rule) return <>{children}</>; // /login and anything unlisted
  if (!ready) return null; // wait until we know who this is, so a page the role can't use never starts loading
  if (can(access, rule)) return <>{children}</>;

  return <NoAccess roles={access?.roles ?? []} />;
}

function NoAccess({ roles }: { roles: string[] }) {
  const home = homeFor(roles);
  return (
    <div className="p-3">
      <div className="mx-auto mt-16 max-w-md rounded-2xl border border-ink-horizon/10 bg-white p-8 text-center">
        <div
          className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-gold/15 text-gold-deep"
          aria-hidden
        >
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="5" y="11" width="14" height="9" rx="2" />
            <path d="M8 11V8a4 4 0 0 1 8 0v3" />
          </svg>
        </div>
        <h1 className="mt-4 font-display text-2xl text-ink-horizon">You don&apos;t have access to this page</h1>
        <p className="mt-2 text-sm text-ink/60">
          Your account&apos;s role doesn&apos;t include this section. If you think it should, ask an administrator to
          update your access.
        </p>
        <Link
          href={home}
          className="mt-6 inline-block rounded-full bg-ink-horizon px-5 py-2 text-sm font-medium text-sand-light transition hover:bg-acacia"
        >
          Go to my dashboard
        </Link>
      </div>
    </div>
  );
}
