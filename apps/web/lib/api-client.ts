import type { ApiResponse } from "@travel/types";
import { apiBase, fetchWithRefresh } from "./api-transport";
import { COOKIE_SESSION } from "./session-core";
import { resolveSlugFromHost, devFallbackSlug } from "./tenant";


export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number
  ) {
    super(message);
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  token?: string;
  idempotencyKey?: string;
  cache?: RequestCache;
  /**
   * Explicit tenant slug - required for Server Component call sites
   * (pass the result of lib/tenant-server.ts's getServerTenantSlug(),
   * since this file itself can never import next/headers: it's also
   * reachable from "use client" pages). Client Component call sites can
   * omit this entirely - it's auto-detected below from window.location,
   * which is exactly the same host a Server Component would have read
   * via the request's Host header.
   */
  tenantSlug?: string;
}

/**
 * Every call unwraps the platform's standard {success, data, meta}
 * / {success:false, error} envelope, so callers just get `data` or
 * a thrown ApiError - no page component needs to know the envelope
 * shape.
 */
export async function apiFetch<T>(path: string, opts: RequestOptions = {}): Promise<{ data: T; meta?: any }> {
  const tenantSlug =
    opts.tenantSlug ??
    (typeof window !== "undefined" ? resolveSlugFromHost(window.location.host) : null) ??
    devFallbackSlug();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Tenant-Slug": tenantSlug,
  };
  // COOKIE_SESSION is a non-secret sentinel: the httpOnly cookie authenticates, so no
  // Authorization header is sent. A genuine bearer token (API-style use) still is.
  const cookieSession = opts.token === COOKIE_SESSION;
  if (opts.token && !cookieSession) headers.Authorization = `Bearer ${opts.token}`;
  // CSRF defence for cookie-authenticated writes, and cookie-mode login (see packages/auth/src/cookies.ts).
  headers["X-Requested-With"] = "travel-web";
  headers["X-Auth-Mode"] = "cookie";
  if (opts.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;

  const res = await fetchWithRefresh(
    path,
    {
    method: opts.method ?? "GET",
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    cache: opts.cache ?? "no-store",
    },
    cookieSession
  );

  const json = (await res.json()) as ApiResponse<T>;

  if (!json.success) {
    throw new ApiError(json.error.code, json.error.message, res.status);
  }
  return { data: json.data, meta: (json as any).meta };
}

/**
 * Resolves a bare custom domain (e.g. "acmetravel.com" - the Host
 * header with any port stripped) to the tenant slug that owns it, via
 * the public, unauthenticated /signup/resolve-domain endpoint (see
 * services/admin/src/public-routes.ts). This is the one lookup that
 * can't go through apiFetch above, since apiFetch needs a tenant slug
 * to send as X-Tenant-Slug and resolving that slug is exactly what
 * this call is for.
 *
 * Returns null for a 404 (no verified tenant owns this domain - the
 * platform's own marketing domain, a typo, or DNS pointed here before
 * verification finished) and swallows network errors the same way,
 * since this runs on every server-rendered request to a non-subdomain
 * host (see lib/tenant-server.ts) and a resolution failure should fall
 * back to devFallbackSlug() rather than crash the page.
 */
export async function resolveTenantSlugByDomain(domain: string): Promise<string | null> {
  try {
    const res = await fetch(`${apiBase()}/api/v1/signup/resolve-domain?domain=${encodeURIComponent(domain)}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as ApiResponse<{ slug: string }>;
    return json.success ? json.data.slug : null;
  } catch {
    return null;
  }
}
