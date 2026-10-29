export const BASE_URL = process.env.E2E_API_URL ?? "http://localhost:4000";
// The platform is multi-tenant: every non-webhook request must resolve a
// tenant. These tests run against the seeded "default" tenant unless told otherwise.
export const TENANT_SLUG = process.env.E2E_TENANT_SLUG ?? "default";

export interface ApiResult<T> {
  status: number;
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}

export async function apiRequest<T = unknown>(
  path: string,
  opts: { method?: string; body?: unknown; token?: string; headers?: Record<string, string> } = {}
): Promise<ApiResult<T>> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-tenant-slug": TENANT_SLUG,
    ...opts.headers,
  };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;

  const res = await fetch(`${BASE_URL}${path}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    data?: T;
    error?: { code: string; message: string };
  };
  return { status: res.status, success: json.success ?? false, data: json.data, error: json.error };
}

/** Waits for the gateway's /health to respond, so tests don't race a slow-starting server. */
export async function waitForGateway(timeoutMs = 30_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${BASE_URL}/health`);
      if (res.ok) return;
    } catch {
      // gateway not up yet - keep polling
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Gateway at ${BASE_URL} did not become healthy within ${timeoutMs}ms`);
}

export function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example-e2e.test`;
}
