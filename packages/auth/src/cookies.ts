import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { env } from "@travel/config";

/**
 * Browser sessions via httpOnly cookies, so a token is never reachable from
 * page JavaScript (an XSS bug can no longer steal a session - it was previously
 * sitting in localStorage). API clients, mobile apps and the e2e suite keep
 * using `Authorization: Bearer` exactly as before; cookies are strictly an
 * addition, opted into per request with `X-Auth-Mode: cookie` on login.
 *
 * Why SameSite=Lax and not None: the web apps reach the API through a
 * same-origin proxy (each app's /api/v1/* route), so the cookie is first-party
 * to the app's own domain - including tenants' custom domains, where a cookie
 * set by the API's domain would be a blocked third-party cookie.
 */
export const ACCESS_COOKIE = "travel_at";
export const REFRESH_COOKIE = "travel_rt";
export const AUTH_MODE_HEADER = "x-auth-mode";
/** CSRF defence for cookie-authenticated writes: a custom header a cross-site form/fetch can't send without a CORS preflight we refuse. */
export const CSRF_HEADER = "x-requested-with";
export const CSRF_VALUE = "travel-web";

/** "15m" | "2h" | "30d" | "900s" | "900" -> seconds. */
export function ttlToSeconds(ttl: string): number {
  const m = /^(\d+)\s*([smhd])?$/.exec(ttl.trim());
  if (!m) throw new Error(`Unrecognised TTL "${ttl}"`);
  const n = Number(m[1]);
  const unit = m[2] ?? "s";
  return n * ({ s: 1, m: 60, h: 3600, d: 86400 }[unit] as number);
}

const secure = () => env.NODE_ENV === "production";

export function isCookieMode(c: Context): boolean {
  return c.req.header(AUTH_MODE_HEADER) === "cookie";
}

export function setSessionCookies(c: Context, tokens: { accessToken: string; refreshToken: string }) {
  setCookie(c, ACCESS_COOKIE, tokens.accessToken, {
    httpOnly: true,
    secure: secure(),
    sameSite: "Lax",
    path: "/",
    maxAge: ttlToSeconds(env.JWT_ACCESS_TTL),
  });
  // The refresh token is only ever needed by the auth endpoints, so it is only SENT to them.
  setCookie(c, REFRESH_COOKIE, tokens.refreshToken, {
    httpOnly: true,
    secure: secure(),
    sameSite: "Lax",
    path: "/api/v1/auth",
    maxAge: ttlToSeconds(env.JWT_REFRESH_TTL),
  });
}

export function clearSessionCookies(c: Context) {
  deleteCookie(c, ACCESS_COOKIE, { path: "/", secure: secure() });
  deleteCookie(c, REFRESH_COOKIE, { path: "/api/v1/auth", secure: secure() });
}

export function readRefreshCookie(c: Context): string | undefined {
  return getCookie(c, REFRESH_COOKIE);
}

export function readAccessCookie(c: Context): string | undefined {
  return getCookie(c, ACCESS_COOKIE);
}

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
export const isUnsafeMethod = (method: string) => UNSAFE_METHODS.has(method.toUpperCase());
