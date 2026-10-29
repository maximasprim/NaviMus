import type { Context } from "hono";
import type { ApiSuccess } from "@travel/types";

/** Wraps a successful payload in the platform-standard envelope. */
export function ok<T>(c: Context, data: T, meta?: Record<string, unknown>, status: 200 | 201 = 200) {
  const body: ApiSuccess<T> = { success: true, data, ...(meta ? { meta } : {}) };
  return c.json(body, status);
}

export function paginated<T>(
  c: Context,
  items: T[],
  page: number,
  pageSize: number,
  total: number,
  extraMeta?: Record<string, unknown>
) {
  return ok(c, items, {
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    ...extraMeta,
  });
}
