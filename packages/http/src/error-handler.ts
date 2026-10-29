import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { ZodError } from "zod";
import { isAppError, type ApiError } from "@travel/types";
import { createServiceLogger, withRequestId, withTenant } from "@travel/logger";

const logger = createServiceLogger("http-error-handler");

/**
 * Single place that turns any thrown error into the standard
 * ApiError envelope. Never leaks a stack trace, a raw DB error
 * message, or internal implementation details to the client -
 * those go to the server log (keyed by requestId, and by tenantId
 * when tenant-context.ts has already resolved one - see
 * tenant-context.ts's own ContextVariableMap declaration, which is
 * why this can read c.get("tenantId") without a workspace
 * dependency on anything beyond this same package) instead.
 */
export function buildErrorHandler() {
  return (err: Error, c: Context) => {
    const requestId = c.get("requestId") ?? "unknown";
    const tenantId = c.get("tenantId");
    const scopedLogger = tenantId ? withTenant(withRequestId(logger, requestId), tenantId) : withRequestId(logger, requestId);

    if (isAppError(err)) {
      const body: ApiError = {
        success: false,
        error: { code: err.code, message: err.message, details: err.details },
        requestId,
      };
      if (err.httpStatus >= 500) {
        scopedLogger.error({ err }, "Unhandled application error");
      }
      return c.json(body, err.httpStatus as any);
    }

    if (err instanceof ZodError) {
      const body: ApiError = {
        success: false,
        error: { code: "VALIDATION_ERROR", message: "Invalid input", details: err.flatten() },
        requestId,
      };
      return c.json(body, 400);
    }

    if (err instanceof HTTPException) {
      const body: ApiError = {
        success: false,
        error: { code: "HTTP_ERROR", message: err.message },
        requestId,
      };
      return c.json(body, err.status);
    }

    // Unknown error: log full detail server-side, return a generic message to the client.
    scopedLogger.error({ err }, "Unexpected error");
    const body: ApiError = {
      success: false,
      error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" },
      requestId,
    };
    return c.json(body, 500);
  };
}
