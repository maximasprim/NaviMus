"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSelectedTenant, type SelectedTenant } from "@/lib/tenant-session";

/**
 * Most of this console's pages (bookings, users, moderation, settings)
 * hit tenant-scoped endpoints under /api/v1/admin, which need exactly
 * one resolved tenant per request - see tenant-session.ts's doc comment.
 * This is the persistent reminder of which one that currently is, so a
 * super_admin never loses track of whose data they're looking at.
 */
export function TenantIndicator() {
  const [tenant, setTenant] = useState<SelectedTenant | null>(null);

  useEffect(() => {
    setTenant(getSelectedTenant());
  }, []);

  return (
    <Link
      href="/tenants"
      className="mb-6 block rounded-xl bg-white/5 px-3 py-2.5 transition-colors hover:bg-white/10"
    >
      {tenant ? (
        <>
          <span className="block text-xs text-sand/50">Managing</span>
          <span className="block truncate text-sm font-medium text-white">{tenant.name}</span>
        </>
      ) : (
        <span className="text-sm text-gold">Select a tenant to manage</span>
      )}
    </Link>
  );
}
