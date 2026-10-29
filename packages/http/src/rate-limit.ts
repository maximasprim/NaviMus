import type { Context, Next } from "hono";
import type Redis from "ioredis";
import { RateLimitError } from "@travel/types";

function defaultKey(c: Context): string {
  return c.get("authUser")?.sub ?? c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? "anonymous";
}

/**
 * Fixed-window rate limiter backed by Redis so limits are shared
 * correctly across multiple service instances (an in-memory
 * limiter would only protect a single process).
 *
 * `keyFn` decides what "one identity" means for this particular limiter
 * instance - defaults to per-authenticated-user (falling back to
 * per-IP for anonymous requests), same as before. The gateway also
 * mounts a second instance keyed by tenantId (see
 * apps/api-gateway/src/index.ts) to cap one tenant's AGGREGATE traffic
 * across every one of their users/IPs, which a purely per-user/per-IP
 * limiter can never do - a tenant with many customers hitting the API
 * at once could otherwise consume a disproportionate share of shared
 * infrastructure while every individual user still looks well within
 * their own limit.
 */
export function rateLimit(redis: Redis, opts: { windowMs: number; max: number; keyPrefix?: string; keyFn?: (c: Context) => string }) {
  const prefix = opts.keyPrefix ?? "ratelimit";
  const keyFn = opts.keyFn ?? defaultKey;
  return async (c: Context, next: Next) => {
    const identity = keyFn(c);
    const windowKey = Math.floor(Date.now() / opts.windowMs);
    const key = `${prefix}:${identity}:${windowKey}`;

    const count = await redis.incr(key);
    if (count === 1) {
      await redis.pexpire(key, opts.windowMs);
    }
    if (count > opts.max) {
      throw new RateLimitError();
    }
    await next();
  };
}
