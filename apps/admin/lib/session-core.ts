/**
 * Browser session state WITHOUT any secret. The real credentials are httpOnly
 * cookies set by the API (see packages/auth/src/cookies.ts); page JavaScript
 * cannot read them, so an XSS bug can no longer steal a session. All this
 * stores is a "I believe I'm signed in" flag, so the UI knows whether to show
 * the login page or the app. The API remains the only authority: if the
 * cookies are gone or expired, the next request gets a 401 and the flag is cleared.
 *
 * Not a "use client" module on purpose: lib/api-client.ts is imported by
 * Server Components too, and only touches these helpers in the browser.
 */
const MARKER_KEY = "travel_admin_session";
const LEGACY_TOKEN_KEY = "travel_admin_access_token";

/** Passed where the code used to pass an access token. Carries no secret; apiFetch recognises it and lets the cookie authenticate instead. */
export const COOKIE_SESSION = "cookie-session";

/**
 * A non-secret cookie that mirrors the localStorage flag above, so the SERVER (middleware.ts) can keep
 * signed-out visitors on the login page instead of flashing the app's menus at them. It carries no
 * credential - the httpOnly cookies above remain the only thing that authenticates - and the API is
 * still the authority: if it says 401, the session is cleared (this cookie included) and the user is
 * sent back to the login page. Needed because the real refresh cookie is only ever sent to /api/v1/auth.
 */
export const SESSION_HINT_COOKIE = "travel_admin_session";
/** Matches JWT_REFRESH_TTL's default (30d); re-stamped each time a silent refresh succeeds. */
const HINT_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function readHintCookie(): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp(`(?:^|; )${SESSION_HINT_COOKIE}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

function writeHintCookie(value: string, maxAgeSeconds: number): void {
  if (typeof document === "undefined") return;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${SESSION_HINT_COOKIE}=${value}; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax${secure}`;
}

export function hasSessionMarker(): boolean {
  if (typeof window === "undefined") return false;
  // Sweep up the access token older versions left in localStorage.
  window.localStorage.removeItem(LEGACY_TOKEN_KEY);
  if (window.localStorage.getItem(MARKER_KEY) === "1") return true;
  // The hint cookie says signed in but the local flag is gone (e.g. only site storage was cleared): treat the
  // two as one. If the session is in fact dead, the first API call returns 401 and the user lands on /login.
  if (readHintCookie() === "1") {
    window.localStorage.setItem(MARKER_KEY, "1");
    return true;
  }
  return false;
}

export function setSessionMarker(): void {
  window.localStorage.setItem(MARKER_KEY, "1");
  writeHintCookie("1", HINT_MAX_AGE_SECONDS);
}

const WORKSPACE_KEY = "travel_admin_workspace";
const LAST_WORKSPACE_KEY = "travel_admin_last_workspace";
const SELECTED_TENANT_KEY = "travel_admin_selected_tenant"; // same key tenant-session.ts uses

export function getWorkspace(): string | null {
  if (typeof window === "undefined") return null;
  try { return window.localStorage.getItem(WORKSPACE_KEY); } catch { return null; }
}

export function getLastWorkspace(): string | null {
  if (typeof window === "undefined") return null;
  try { return window.localStorage.getItem(LAST_WORKSPACE_KEY); } catch { return null; }
}

export function setWorkspace(slug: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(WORKSPACE_KEY, slug);
  window.localStorage.setItem(LAST_WORKSPACE_KEY, slug);
}

export function clearSessionMarker(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(MARKER_KEY);
  window.localStorage.removeItem(SELECTED_TENANT_KEY); // new: stale tenant caused the login failure
  window.localStorage.removeItem(WORKSPACE_KEY);       // new
  writeHintCookie("", 0);
}
