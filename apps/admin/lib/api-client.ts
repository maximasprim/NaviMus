import type { ApiResponse } from "@travel/types";
import { apiBase, fetchWithRefresh, leaveForLogin } from "./api-transport";
import { COOKIE_SESSION, getWorkspace } from "./session-core";
import { clearSelectedTenant, getSelectedTenant } from "./tenant-session";


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
  cache?: RequestCache;
  /**
   * Set false for platform-level calls (/api/v1/platform/*, i.e. tenant
   * management itself) - those operate above any single tenant, and the
   * gateway bypasses tenant resolution for that prefix regardless, but
   * omitting the header there too keeps the distinction visible in
   * network traces. Every other admin call defaults to true, sending
   * whichever tenant is currently selected (see tenant-session.ts).
   */
  includeTenant?: boolean;
  /**
   * Explicit tenant slug for this one call (used by login, which must name the tenant the account lives in).
   * Overrides the stored selection and workspace instead of being influenced by them.
   */
  tenantSlug?: string;
}

/** True for the gateway's "token belongs to a different tenant than the one requested" rejection. */
async function isTenantMismatch(res: Response): Promise<boolean> {
  try {
    const body = await res.clone().json();
    return body?.success === false && typeof body.error?.message === "string" && body.error.message.includes("not valid for the requested tenant");
  } catch {
    return false;
  }
}

export async function apiFetch<T>(path: string, opts: RequestOptions = {}): Promise<{ data: T; meta?: any }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  // COOKIE_SESSION is a non-secret sentinel: the httpOnly cookie authenticates, so no
  // Authorization header is sent. A genuine bearer token (API-style use) still is.
  const cookieSession = opts.token === COOKIE_SESSION;
  if (opts.token && !cookieSession) headers.Authorization = `Bearer ${opts.token}`;
  // CSRF defence for cookie-authenticated writes, and cookie-mode login (see packages/auth/src/cookies.ts).
  headers["X-Requested-With"] = "travel-web";
  headers["X-Auth-Mode"] = "cookie";

  const includeTenant = opts.includeTenant ?? true;
  const selected = includeTenant && !opts.tenantSlug ? getSelectedTenant() : null;
  // Which tenant this request is for. Re-run on the retry below, after a stale selection has been dropped.
  const applyTenantHeaders = (useSelected: boolean) => {
    delete headers["X-Tenant-Id"];
    delete headers["X-Tenant-Slug"];
    if (opts.tenantSlug) {
      headers["X-Tenant-Slug"] = opts.tenantSlug;
    } else if (useSelected && selected) {
      headers["X-Tenant-Id"] = selected.id;
    } else if (includeTenant) {
      // The workspace the user signed in to, else the dev/default tenant (otherwise the gateway can't resolve a
      // tenant on localhost and answers 404).
      headers["X-Tenant-Slug"] = getWorkspace() ?? process.env.NEXT_PUBLIC_DEV_TENANT_SLUG ?? "default";
    }
  };
  applyTenantHeaders(true);

  const send = () =>
    fetchWithRefresh(
      path,
      {
        method: opts.method ?? "GET",
        headers,
        body: opts.body ? JSON.stringify(opts.body) : undefined,
        cache: opts.cache ?? "no-store",
      },
      cookieSession
    );

  let res = await send();

  // "This token is not valid for the requested tenant": the session is fine (not a 401), but the tenant this
  // request named is not the one the account belongs to - typically a stale "currently viewing" tenant left
  // over from another session. Recover instead of leaving the user on an error page:
  //   1) drop the stale selection and retry once as the workspace they signed in to;
  //   2) if it is STILL a mismatch, the stored workspace is wrong too, so sign in again (with an explanation).
  // Only after the retry do we redirect - going straight to /login would loop if the stale value survived.
  if (res.status === 403 && cookieSession && !opts.tenantSlug && (await isTenantMismatch(res))) {
    if (selected) {
      clearSelectedTenant();
      applyTenantHeaders(false);
      res = await send();
    }
    if (res.status === 403 && (await isTenantMismatch(res))) leaveForLogin("tenant");
  }

  const json = (await res.json()) as ApiResponse<T>;
  if (!json.success) {
    throw new ApiError(json.error.code, json.error.message, res.status);
  }
  return { data: json.data, meta: (json as any).meta };
}
