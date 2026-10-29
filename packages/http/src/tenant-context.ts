import type { Context, Next } from "hono";
import { AuthorizationError, NotFoundError } from "@travel/types";

export interface ResolvedTenant {
  id: string;
  slug: string;
  status: string;
}

declare module "hono" {
  interface ContextVariableMap {
    tenantId: string;
    tenantSlug: string;
  }
}

const TENANT_ID_HEADER = "x-tenant-id";
const TENANT_SLUG_HEADER = "x-tenant-slug";

/**
 * Extracts a tenant slug from a subdomain, e.g. "acme.travelplatform.com"
 * -> "acme". Returns null for bare/unknown hosts ("localhost",
 * "travelplatform.com" with no subdomain, IP addresses) so callers can
 * fall through to another resolution method instead of treating "www" or
 * "api" as a tenant slug.
 */
function extractSubdomainSlug(host: string | undefined): string | null {
  if (!host) return null;
  const hostname = host.split(":")[0] ?? host;
  const parts = hostname.split(".");
  if (parts.length < 3) return null; // "travelplatform.com" or "localhost" - no subdomain
  const candidate = parts[0];
  if (!candidate || candidate === "www" || candidate === "api") return null;
  return candidate;
}

/**
 * Returns the bare hostname (no port), when the Host header looks like a
 * standalone domain rather than a subdomain of the platform's own
 * domain - i.e. when extractSubdomainSlug wouldn't already resolve it.
 * Used for custom-domain lookups (e.g. "acmetravel.com" or
 * "www.acmetravel.com", as opposed to "acme.travelplatform.com").
 * Deliberately permissive here (any 2+-label host qualifies) - the
 * actual security boundary is that resolveTenant's domain lookup only
 * ever matches a VERIFIED custom_domain row, so a request claiming an
 * arbitrary Host header that nobody has verified simply won't resolve
 * to anything, verified or not.
 */
function extractBareDomain(host: string | undefined): string | null {
  if (!host) return null;
  const hostname = host.split(":")[0] ?? host;
  return hostname.includes(".") ? hostname.replace(/^www\./, "") : null;
}

/**
 * Resolves which tenant a request belongs to and puts it on the Hono
 * context as `tenantId`/`tenantSlug`, for every downstream handler and
 * repository to read. Runs *before* auth: unauthenticated endpoints
 * (browsing a tenant's public catalog, logging in) need tenant context
 * too, since the login lookup itself is tenant-scoped (users.tenantId).
 *
 * `resolveTenant` is injected rather than this module importing
 * @travel/database directly, so @travel/http stays framework/DB-agnostic
 * - the same dependency-injection shape as rateLimit(redis, ...).
 *
 * Resolution order: X-Tenant-Id header, X-Tenant-Slug header, subdomain
 * of Host (acme.travelplatform.com -> "acme"), then - only if none of
 * those match - the full Host as a custom domain (acmetravel.com). The
 * custom-domain path is tried last and only matches a tenant whose
 * `customDomainVerifiedAt` is set (see resolveTenant's implementation
 * in apps/api-gateway), so an unverified domain a tenant merely typed
 * into their own settings can never hijack traffic for a domain they
 * don't actually control.
 *
 * Deliberately does NOT fall back to a default tenant when nothing
 * resolves. Silently defaulting is exactly the kind of gap that would
 * let a misconfigured client see the wrong tenant's data by accident -
 * an unresolvable tenant is a 404, and callers that genuinely have no
 * tenant (platform-level super_admin endpoints) should be mounted
 * outside this middleware entirely rather than relying on it to no-op.
 */
export function tenantContext(
  resolveTenant: (idOrSlug: { id?: string; slug?: string; domain?: string }) => Promise<ResolvedTenant | null>
) {
  return async (c: Context, next: Next) => {
    const idHeader = c.req.header(TENANT_ID_HEADER);
    const slugHeader = c.req.header(TENANT_SLUG_HEADER);
    const host = c.req.header("host");
    const hostSlug = extractSubdomainSlug(host);

    let tenant: ResolvedTenant | null = null;
    if (idHeader) {
      tenant = await resolveTenant({ id: idHeader });
    } else if (slugHeader) {
      tenant = await resolveTenant({ slug: slugHeader });
    } else if (hostSlug) {
      tenant = await resolveTenant({ slug: hostSlug });
    } else {
      const bareDomain = extractBareDomain(host);
      if (bareDomain) {
        tenant = await resolveTenant({ domain: bareDomain });
      }
    }

    if (!tenant) {
      throw new NotFoundError("Tenant");
    }
    if (tenant.status === "suspended") {
      throw new AuthorizationError("This account is currently suspended. Contact support for assistance.");
    }

    c.set("tenantId", tenant.id);
    c.set("tenantSlug", tenant.slug);
    await next();
  };
}
