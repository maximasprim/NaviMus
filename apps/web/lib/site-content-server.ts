import { cache } from "react";
import { apiFetch } from "./api-client";
import { getServerTenantSlug } from "./tenant-server";
import { isNextControlFlowSignal } from "./next-signals";
import { DEFAULT_SITE_CONTENT, mergeSiteContent, resolveSiteTokens, type ResolvedSiteContent, type SiteContent } from "./site-content";

const FETCH_TIMEOUT_MS = 3000;

/**
 * The current tenant's public site content, for Server Components (layout, pages, metadata).
 *
 * Wrapped in React's cache(): layout, page and generateMetadata all call this during one request and
 * it hits the API once. It NEVER throws and never blocks for long - if the API is down, slow, or
 * returns something unusable, the storefront renders its built-in defaults (what it showed before
 * tenants could edit it) instead of an error page. (Next's own control-flow signals are re-thrown.)
 */
export const getSiteContent = cache(async (): Promise<ResolvedSiteContent> => {
  try {
    const tenantSlug = await getServerTenantSlug();
    const res = await withTimeout(apiFetch<{ content: SiteContent }>("/api/v1/site", { tenantSlug }), FETCH_TIMEOUT_MS);
    return resolveSiteTokens(mergeSiteContent(DEFAULT_SITE_CONTENT, res.data?.content));
  } catch (err) {
    // headers() signals "this page is dynamic" by throwing. Swallowing that would let Next prerender the page once,
    // at build time, with the DEFAULT branding - and serve it to every tenant. Only real failures fall back.
    if (isNextControlFlowSignal(err)) throw err;
    return resolveSiteTokens(mergeSiteContent(DEFAULT_SITE_CONTENT, null));
  }
});

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("site content request timed out")), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}
