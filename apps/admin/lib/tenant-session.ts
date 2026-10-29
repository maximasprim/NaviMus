"use client";

const SELECTED_TENANT_KEY = "travel_admin_selected_tenant";

export interface SelectedTenant {
  id: string;
  name: string;
  slug: string;
}

/**
 * The admin console manages every tenant from one login, but most of
 * the platform's endpoints (bookings, users, moderation, settings -
 * everything under /api/v1/admin) still expect exactly one resolved
 * tenant per request (see packages/http/src/tenant-context.ts). This
 * is the "which tenant am I currently looking at" state that closes
 * that gap: once picked (from the Tenants page), it's sent as
 * X-Tenant-Id on every subsequent call via api-client.ts, and the
 * gateway trusts it because the super_admin's own JWT is exempted from
 * the tenant-match check in requireAuth (see packages/auth/src/middleware.ts).
 *
 * Same localStorage caveat as lib/session.ts's access token - swap for
 * a server-set cookie before production, so a stale tab can't silently
 * keep acting on a tenant that's since been suspended.
 */
export function getSelectedTenant(): SelectedTenant | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(SELECTED_TENANT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SelectedTenant;
  } catch {
    return null;
  }
}

export function setSelectedTenant(tenant: SelectedTenant): void {
  window.localStorage.setItem(SELECTED_TENANT_KEY, JSON.stringify(tenant));
}

export function clearSelectedTenant(): void {
  window.localStorage.removeItem(SELECTED_TENANT_KEY);
}
