import type { Context, Next } from "hono";
import { randomUUID } from "node:crypto";

declare module "hono" {
  interface ContextVariableMap {
    requestId: string;
  }
}

/**
 * Assigns (or propagates, if the gateway already set one) a
 * request id so every log line and error response can be
 * correlated across services for a single client request.
 */
export async function requestIdMiddleware(c: Context, next: Next) {
  const incoming = c.req.header("x-request-id");
  const requestId = incoming && incoming.length <= 128 ? incoming : randomUUID();
  c.set("requestId", requestId);
  c.header("x-request-id", requestId);
  await next();
}
