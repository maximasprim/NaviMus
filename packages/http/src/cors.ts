/**
 * CORS origin policy. A pure module so every rule is unit tested.
 *
 * Browsers do NOT call this API cross-origin in the normal setup: each web app
 * reaches it through its own same-origin /api/v1/* proxy (so the httpOnly
 * session cookie is first-party). CORS therefore only matters for third-party
 * browser clients of the public API, and for local development. Rules:
 *
 *  - Explicit allowlist only (CORS_ALLOWED_ORIGINS). Never "*", never a
 *    reflected arbitrary Origin.
 *  - NEVER credentialed. Cookie sessions must not be usable from another
 *    origin: that would reopen the CSRF hole the cookie design closes
 *    (SameSite + the X-Requested-With header). Cross-origin callers use
 *    Authorization: Bearer, which needs no cookie.
 *  - A leading "*." label allows tenant subdomains: https://*.example.com
 *    matches https://acme.example.com, but not https://example.com itself,
 *    not https://evil-example.com, and not https://example.com.evil.test.
 *  - With nothing configured: production allows no cross-origin browser
 *    access; development allows loopback origins only.
 */

export function parseAllowedOrigins(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim().replace(/\/+$/, ""))
    .filter(Boolean);
}

const LOOPBACK = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;

function matchesPattern(origin: string, pattern: string): boolean {
  if (pattern === origin) return true;
  const wildcard = /^(https?):\/\/\*\.(.+)$/i.exec(pattern);
  if (!wildcard) return false;
  const [, scheme, suffix] = wildcard as unknown as [string, string, string];
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (url.protocol !== `${scheme.toLowerCase()}:`) return false;
  const host = url.host.toLowerCase(); // includes port, so a pattern may pin one
  const base = suffix.toLowerCase();
  // Must be a real subdomain: ends with ".<suffix>" and has at least one label before it.
  return host.endsWith(`.${base}`) && host.length > base.length + 1;
}

/** Returns the origin to echo back in Access-Control-Allow-Origin, or null to refuse. */
export function resolveCorsOrigin(origin: string | undefined, allowed: string[], opts: { production: boolean }): string | null {
  if (!origin) return null;
  if (allowed.some((p) => matchesPattern(origin, p))) return origin;
  if (!opts.production && allowed.length === 0 && LOOPBACK.test(origin)) return origin;
  return null;
}

/** Headers the API reads from browsers; anything else in a preflight is refused. */
export const CORS_ALLOW_HEADERS = [
  "Content-Type",
  "Authorization",
  "Idempotency-Key",
  "X-Tenant-Slug",
  "X-Tenant-Id",
];
export const CORS_ALLOW_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"];
export const CORS_EXPOSE_HEADERS = ["X-Request-Id", "Retry-After"];
