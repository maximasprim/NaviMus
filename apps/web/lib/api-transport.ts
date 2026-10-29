import { clearSessionMarker } from "./session-core";

/**
 * In the browser, API calls go to THIS app's own origin (/api/v1/*, proxied
 * to the gateway by app/api/v1/[...path]/route.ts) so the session cookie is
 * first-party - which also makes it work on tenants' custom domains, where a
 * cookie set by the API's own domain would be blocked as third-party.
 * On the server (SSR) there is no browser and no cookie: call the API directly.
 */
export function apiBase(): string {
  if (typeof window !== "undefined") return "";
  return process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
}

let refreshing: Promise<boolean> | null = null;

/** One refresh at a time, however many requests hit a 401 together (rotation would otherwise make all but one fail). */
function refreshSession(headers: Record<string, string>): Promise<boolean> {
  if (!refreshing) {
    const { Authorization: _drop, ...rest } = headers;
    refreshing = fetch(`${apiBase()}/api/v1/auth/refresh`, { method: "POST", headers: rest, body: "{}", credentials: "same-origin" })
      .then((r) => r.ok)
      .catch(() => false)
      .finally(() => {
        setTimeout(() => (refreshing = null), 0);
      });
  }
  return refreshing;
}

/**
 * fetch + cookie-session handling. A 401 on a cookie session first tries one
 * silent refresh (the short-lived access cookie simply expired) and replays
 * the request; if that fails the session is really over, so the signed-in
 * marker is cleared and the caller sees the 401.
 */
export async function fetchWithRefresh(path: string, init: RequestInit & { headers: Record<string, string> }, cookieSession: boolean): Promise<Response> {
  const send = () => fetch(`${apiBase()}${path}`, { ...init, credentials: "same-origin" });
  let res = await send();
  if (res.status === 401 && cookieSession && !path.startsWith("/api/v1/auth/")) {
    if (await refreshSession(init.headers)) res = await send();
    if (res.status === 401) clearSessionMarker();
  }
  return res;
}
