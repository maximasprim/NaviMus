/**
 * Extracts a tenant slug from a subdomain, e.g. "acme.NaviMus.travel"
 * -> "acme". Mirrors exactly how the API gateway resolves it server-side
 * (see packages/http/src/tenant-context.ts) - the two must agree, or a
 * visitor's browser and the API they're calling would resolve to
 * different tenants for what looks like the same request.
 */
export function resolveSlugFromHost(host: string | null | undefined): string | null {
  if (!host) return null;
  const hostname = host.split(":")[0] ?? host;
  const parts = hostname.split(".");
  if (parts.length < 3) return null; // "NaviMus.travel" or "localhost" - no subdomain
  const candidate = parts[0];
  if (!candidate || candidate === "www") return null;
  return candidate;
}

/**
 * Local development has no real subdomain to read from. This lets a
 * developer pin a tenant via .env.local (NEXT_PUBLIC_DEV_TENANT_SLUG),
 * defaulting to "default" - the seed script's default tenant - so local
 * dev works without needing *.localhost subdomain tricks. Only ever
 * reached when resolveSlugFromHost above returns null (no subdomain),
 * so it can't accidentally override a real subdomain in production.
 */
export function devFallbackSlug(): string {
  return process.env.NEXT_PUBLIC_DEV_TENANT_SLUG ?? "default";
}
