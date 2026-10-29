import { clearSessionMarker, setSessionMarker } from "./session-core";

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
      .then((r) => {
        // Still signed in: push the "signed in" hint's expiry forward along with the rotated refresh token.
        if (r.ok && typeof window !== "undefined") setSessionMarker();
        return r.ok;
      })
      .catch(() => false)
      .finally(() => {
        setTimeout(() => (refreshing = null), 0);
      });
  }
  return refreshing;
}

/** Set once the user deliberately signs out, so requests still in flight (they 401 once the session is revoked) don't also report "expired". */
let signingOut = false;

/** The session is really over (refresh failed too): forget it locally, then go back to the login page. */
export function leaveForLogin(reason?: "tenant"): void {
  clearSessionMarker();
  if (typeof window === "undefined") return;
  if (signingOut) return; // the sign-out button is already taking the user to /login
  const { pathname, search } = window.location;
  if (pathname === "/login") return; // already there
  const qs = new URLSearchParams({ expired: "1" });
  if (reason) qs.set("reason", reason); 
  const next = `${pathname}${search}`;
  if (next !== "/") qs.set("next", next);
  // A full navigation, not router.push: it drops any cached copy of the protected pages.
  window.location.assign(`/login?${qs.toString()}`);
}

/**
 * fetch + cookie-session handling. A 401 on a cookie session first tries one
 * silent refresh (the short-lived access cookie simply expired) and replays
 * the request; if that fails the session is really over, so the signed-in
 * marker is cleared, the browser is sent to the login page, and the caller sees the 401.
 */
export async function fetchWithRefresh(path: string, init: RequestInit & { headers: Record<string, string> }, cookieSession: boolean): Promise<Response> {
  if (path === "/api/v1/auth/logout") signingOut = true;
  const send = () => fetch(`${apiBase()}${path}`, { ...init, credentials: "same-origin" });
  let res = await send();
  if (res.status === 401 && cookieSession && !path.startsWith("/api/v1/auth/")) {
    if (await refreshSession(init.headers)) res = await send();
    if (res.status === 401) leaveForLogin();
  }
  return res;
}
