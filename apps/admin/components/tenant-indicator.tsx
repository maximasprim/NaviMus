"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSelectedTenant, type SelectedTenant } from "@/lib/tenant-session";
import { getIsPlatformAdmin, getWorkspace } from "@/lib/session-core";

/**
 * Most of this console's pages (bookings, users, moderation, settings)
 * hit tenant-scoped endpoints under /api/v1/admin, which need exactly
 * one resolved tenant per request - see tenant-session.ts's doc comment.
 * This is the persistent reminder of which one that currently is, so a
 * super_admin never loses track of whose data they're looking at.
 *
 * A platform admin manages tenants; a tenant admin manages their own operators.
 */
export function TenantIndicator() {
  const [tenant, setTenant] = useState<SelectedTenant | null>(null);
  // null until read in the browser (localStorage doesn't exist on the server), so the wrong label never flashes.
  const [isPlatform, setIsPlatform] = useState<boolean | null>(null);

  useEffect(() => {
    setTenant(getSelectedTenant());
    // Sessions that began before the flag existed fall back to the workspace: the platform's own tenant is "default".
    setIsPlatform(getIsPlatformAdmin() ?? getWorkspace() === "default");
  }, []);

  return (
     <Link
      href={isPlatform === false ? "/operators" : "/tenants"}
      className="group mb-4 flex cursor-pointer items-center justify-between gap-2 rounded-xl bg-white/5 px-3 py-1.5 transition-colors hover:bg-white/10"
    >
      {tenant ? (
        <span className="min-w-0">
          <span className="block text-xs text-sand/50">Managing</span>
          <span className="block truncate text-sm font-medium text-white underline decoration-white/30 underline-offset-4 group-hover:decoration-white">
            {tenant.name}
          </span>
        </span>
      ) : (
        <span className="text-sm text-gold underline decoration-gold/40 underline-offset-4 group-hover:decoration-gold">
          {isPlatform === null ? "\u00A0" : isPlatform ? "Tenant management" : "Operator management"}
        </span>
      )}
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="h-4 w-4 shrink-0 rotate-90 fill-none stroke-current stroke-2 text-gold transition-transform group-hover:translate-x-0.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M22 14a8 8 0 0 1-8 8" />
        <path d="M18 11v-1a2 2 0 0 0-2-2a2 2 0 0 0-2 2" />
        <path d="M14 10V9a2 2 0 0 0-2-2a2 2 0 0 0-2 2v1" />
        <path d="M10 9.5V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v10" />
        <path d="M18 11a2 2 0 1 1 4 0v3a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
      </svg>
    </Link>
  );
}