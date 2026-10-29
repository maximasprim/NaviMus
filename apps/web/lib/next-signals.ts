/**
 * Next.js signals "this page needs per-request data" (headers(), cookies(), ...) - and a few other
 * control-flow events - by THROWING. Code that catches errors broadly must let these through, otherwise
 * Next never learns the page is dynamic and prerenders it once at build time, freezing whatever the
 * catch block returned (here: the default branding) into the page for every tenant.
 */
export function isNextControlFlowSignal(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const digest = (err as { digest?: unknown }).digest;
  if (typeof digest === "string") {
    return (
      digest.startsWith("DYNAMIC_SERVER_USAGE") ||
      digest === "BAILOUT_TO_CLIENT_SIDE_RENDERING" ||
      digest.startsWith("NEXT_REDIRECT") ||
      digest.startsWith("NEXT_NOT_FOUND") ||
      digest.startsWith("NEXT_HTTP_ERROR_FALLBACK")
    );
  }
  return false;
}
