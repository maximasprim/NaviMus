import { headers } from "next/headers";
import { resolveSlugFromHost, devFallbackSlug } from "./tenant";
import { resolveTenantSlugByDomain } from "./api-client";

/**
 * Reads the tenant slug from the current request's own Host header -
 * available directly in Server Components via next/headers, no
 * middleware needed. Used only by server-rendered data-fetching pages
 * (the public catalog: destinations, packages, home) - authenticated
 * dashboard pages are Client Components (see lib/session.ts) and resolve
 * their own tenant client-side instead, since next/headers cannot be
 * imported anywhere reachable from a "use client" file.
 *
 * Subdomains (acme.NaviMus.travel) resolve instantly, no network call.
 * A bare Host with no subdomain (acmetravel.com) is either a tenant's
 * verified custom domain or the platform's own marketing domain - the
 * only way to tell which is to ask the API (see
 * lib/api-client.ts's resolveTenantSlugByDomain and the gateway's own
 * identical resolution order in apps/api-gateway/src/index.ts, which
 * this must keep matching). Falls back to devFallbackSlug() only when
 * neither resolves - local dev with no subdomain, or a domain nobody
 * has verified.
 */
export async function getServerTenantSlug(): Promise<string> {
  const host = headers().get("host");
  const subdomainSlug = resolveSlugFromHost(host);
  if (subdomainSlug) return subdomainSlug;

  const bareHost = host?.split(":")[0];
  if (bareHost) {
    const resolved = await resolveTenantSlugByDomain(bareHost);
    if (resolved) return resolved;
  }

  return devFallbackSlug();
}

/**
 * The public origin of the site being served (e.g. https://acme.NaviMus.travel or a tenant's own domain), for
 * sitemap.xml, robots.txt and canonical/OpenGraph URLs. Each tenant gets its own, taken from the request's
 * host. NEXT_PUBLIC_SITE_URL is only used when the request has no usable public host (local dev / internal
 * hostnames), and finally the old placeholder, so nothing that worked before stops working.
 */
export function getServerSiteUrl(): string {
  const h = headers();
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "").split(",")[0].trim();
  const bare = host.split(":")[0].toLowerCase();
  const internal = !bare || bare === "localhost" || bare.endsWith(".localhost") || /^\d{1,3}(\.\d{1,3}){3}$/.test(bare) || !bare.includes(".");
  if (!internal && /^[a-z0-9.-]+(:\d+)?$/i.test(host)) {
    const proto = (h.get("x-forwarded-proto") ?? "https").split(",")[0].trim() === "http" ? "http" : "https";
    return `${proto}://${host}`;
  }
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "https://example-travel.com").replace(/\/+$/, "");
}
