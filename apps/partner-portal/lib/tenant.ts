/**
 * Extracts a tenant slug from a subdomain, e.g. "acme.partners.NaviMus.travel"
 * -> "acme". Mirrors exactly how the API gateway resolves it server-side
 * (see packages/http/src/tenant-context.ts).
 */
export function resolveSlugFromHost(host: string | null | undefined): string | null {
  if (!host) return null;
  const hostname = host.split(":")[0] ?? host;
  const parts = hostname.split(".");
  if (parts.length < 3) return null; // no subdomain
  const candidate = parts[0];
  if (!candidate || candidate === "www") return null;
  return candidate;
}

/**
 * Local development fallback - see apps/web/lib/tenant.ts's identical
 * doc comment for why this only ever applies when there's no real
 * subdomain to read (never in production).
 */
export function devFallbackSlug(): string {
  return process.env.NEXT_PUBLIC_DEV_TENANT_SLUG ?? "default";
}
