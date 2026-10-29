import type { Context, Next } from "hono";
import type { Logger } from "@travel/logger";
import { withRequestId, withTenant } from "@travel/logger";

/**
 * Structured request log - one JSON line per request with method,
 * path, status, duration, requestId, and (once tenant-context.ts has
 * resolved one) tenantId, replacing hono/logger's plain colorized text
 * line. The tenant tag is what makes this actually useful for a
 * multi-tenant system: "show me every 5xx for tenant X in the last
 * hour" is a log query away instead of a guess. Mount this AFTER
 * tenantContext so tenantId is already on the context when this reads
 * it (mounting order matters - see apps/api-gateway/src/index.ts).
 */
export function accessLog(logger: Logger) {
  return async (c: Context, next: Next) => {
    const start = Date.now();
    await next();
    const durationMs = Date.now() - start;

    const requestId = c.get("requestId") ?? "unknown";
    const tenantId = c.get("tenantId");
    const scoped = tenantId ? withTenant(withRequestId(logger, requestId), tenantId) : withRequestId(logger, requestId);

    scoped.info(
      { method: c.req.method, path: c.req.path, status: c.res.status, durationMs },
      `${c.req.method} ${c.req.path} ${c.res.status} ${durationMs}ms`
    );
  };
}
