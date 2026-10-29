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
const MARKER_KEY = "travel_session";
const LEGACY_TOKEN_KEY = "travel_access_token";

/** Passed where the code used to pass an access token. Carries no secret; apiFetch recognises it and lets the cookie authenticate instead. */
export const COOKIE_SESSION = "cookie-session";

export function hasSessionMarker(): boolean {
  if (typeof window === "undefined") return false;
  // Sweep up the access token older versions left in localStorage.
  window.localStorage.removeItem(LEGACY_TOKEN_KEY);
  return window.localStorage.getItem(MARKER_KEY) === "1";
}

export function setSessionMarker(): void {
  window.localStorage.setItem(MARKER_KEY, "1");
}

export function clearSessionMarker(): void {
  if (typeof window !== "undefined") window.localStorage.removeItem(MARKER_KEY);
}
