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
}

/**
 * Every page in this app is a Client Component (see lib/session.ts's
 * localStorage-based auth), so the tenant slug is always resolved from
 * window.location here - there's no server-rendered data-fetching path
 * that would need next/headers the way apps/web's public catalog pages do.
 */
export async function apiFetch<T>(path: string, opts: RequestOptions = {}): Promise<{ data: T; meta?: any }> {
  const tenantSlug = (typeof window !== "undefined" ? resolveSlugFromHost(window.location.host) : null) ?? devFallbackSlug();

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
