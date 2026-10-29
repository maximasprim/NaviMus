"use client";

import { COOKIE_SESSION, clearSessionMarker, hasSessionMarker, setSessionMarker } from "./session-core";

/**
 * Compatibility surface for the ~100 existing call sites: getToken() still
 * returns something truthy while signed in, but it is the non-secret
 * COOKIE_SESSION sentinel, never a credential. See session-core.ts.
 */
export function getToken(): string | null {
  return hasSessionMarker() ? COOKIE_SESSION : null;
}

/** Call after a successful login (the API has already set the httpOnly cookies). */
export function setToken(_unused?: string): void {
  setSessionMarker();
}

export function clearToken(): void {
  clearSessionMarker();
}

export function isLoggedIn(): boolean {
  return hasSessionMarker();
}
