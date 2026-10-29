import type { Context, Next } from "hono";
import { AuthenticationError, AuthorizationError } from "@travel/types";
import { verifyAccessToken, type AccessTokenPayload } from "./jwt.js";
import { CSRF_HEADER, CSRF_VALUE, isUnsafeMethod, readAccessCookie } from "./cookies.js";

declare module "hono" {
  interface ContextVariableMap {
    authUser: AccessTokenPayload;
  }
}

/**
 * Verifies the Bearer token and attaches the decoded user to the
 * Hono context as `authUser`. Every downstream handler reads
 * identity from there - never from a client-supplied user id in
 * the body/query, which would let one user act as another.
 *
 * Also cross-checks the token's own tenantId against the request's
 * resolved tenant (set by @travel/http's tenantContext middleware,
 * mounted at the gateway, which runs before routing reaches this
 * per-route middleware). This has to live here rather than as its own
 * middleware: tenantContext runs before requireAuth for every request,
 * but requireAuth itself is what's mounted on individual authenticated
 * routes, so this is the first point where both the decoded token and
 * the resolved tenant are available together. Without this check, a
 * valid token issued for Tenant A could be replayed with a spoofed
 * `X-Tenant-Id: B` header to act on Tenant B's data.
 *
 * super_admin is exempt - acting across tenants is that role's entire
 * purpose (see services/admin's tenant-management endpoints).
 *
 * Reads `tenantId` off the context with a permissive cast rather than a
 * `declare module "hono"` augmentation here, since @travel/auth
 * intentionally doesn't depend on @travel/http for that type.
 */
/**
 * Finds the caller's access token. An explicit Bearer header always wins (API
 * clients, mobile, tests); otherwise the httpOnly session cookie set by login
 * in cookie mode. A cookie is an ambient credential - the browser attaches it
 * to ANY request to this origin, including ones a hostile page triggers - so a
 * cookie-authenticated WRITE must also carry the CSRF header, which a
 * cross-site request cannot add without a CORS preflight we refuse.
 */
function extractToken(c: Context): { token: string; csrfOk: boolean } | null {
  const header = c.req.header("authorization");
  if (header?.startsWith("Bearer ")) return { token: header.slice("Bearer ".length), csrfOk: true };
  const cookie = readAccessCookie(c);
  if (!cookie) return null;
  const csrfOk = !isUnsafeMethod(c.req.method) || c.req.header(CSRF_HEADER) === CSRF_VALUE;
  return { token: cookie, csrfOk };
}

export async function requireAuth(c: Context, next: Next) {
  const found = extractToken(c);
  if (!found) {
    throw new AuthenticationError("Missing bearer token");
  }
  if (!found.csrfOk) {
    throw new AuthorizationError("Missing CSRF header on a cookie-authenticated request");
  }
  const payload = await verifyAccessToken(found.token);

  const requestTenantId = c.get("tenantId" as never) as string | undefined;
  if (requestTenantId && !payload.roles.includes("super_admin") && payload.tenantId !== requestTenantId) {
    throw new AuthorizationError("This token is not valid for the requested tenant");
  }

  c.set("authUser", payload);
  await next();
}

/** Optional auth: attaches authUser if present, but does not require it (e.g. public search with personalization). */
export async function optionalAuth(c: Context, next: Next) {
  const found = extractToken(c);
  // A cookie on a write without the CSRF header is simply not treated as a login here.
  if (found?.csrfOk) {
    try {
      const payload = await verifyAccessToken(found.token);
      c.set("authUser", payload);
    } catch {
      // Silently proceed unauthenticated - an invalid optional token isn't a hard failure.
    }
  }
  await next();
}

/** Requires the caller to hold at least one of the given permission codes. */
export function requirePermissions(...permissions: string[]) {
  return async (c: Context, next: Next) => {
    const user = c.get("authUser");
    if (!user) throw new AuthenticationError();
    const hasAny = permissions.some((p) => user.permissions.includes(p));
    if (!hasAny) {
      throw new AuthorizationError(`Requires one of: ${permissions.join(", ")}`);
    }
    await next();
  };
}

/** Requires the caller to hold at least one of the given roles. */
export function requireRoles(...roles: string[]) {
  return async (c: Context, next: Next) => {
    const user = c.get("authUser");
    if (!user) throw new AuthenticationError();
    const hasAny = roles.some((r) => user.roles.includes(r));
    if (!hasAny) {
      throw new AuthorizationError(`Requires one of roles: ${roles.join(", ")}`);
    }
    await next();
  };
}
