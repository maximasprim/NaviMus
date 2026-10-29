import { apiRequest } from "./client.js";

/**
 * Credentials for the fictional accounts created by
 * `pnpm --filter @travel/database db:seed` (see
 * packages/database/src/seed/index.ts). These tests assume the
 * seed has already been run against the target database - they do
 * not seed data themselves, so failures here after a fresh
 * migration-only DB usually mean "forgot to run db:seed", not a
 * real bug.
 */
export const SEED_PASSWORD = "Test-Passw0rd!";
export const SEED_ADMIN_EMAIL = "admin@example-travel-demo.test";
export const SEED_OPERATOR_EMAIL = "operator@example-travel-demo.test";
export const SEED_CUSTOMER_EMAIL = "customer@example-travel-demo.test";
export const SEED_PACKAGE_SLUG = "3-day-maasai-mara-safari-demo";

export async function loginAs(email: string, password: string = SEED_PASSWORD): Promise<string> {
  const res = await apiRequest<{ accessToken: string }>("/api/v1/auth/login", {
    method: "POST",
    body: { email, password },
  });
  if (!res.success || !res.data) {
    throw new Error(`Login failed for ${email}: ${res.error?.code} ${res.error?.message}`);
  }
  return res.data.accessToken;
}

/** Returns an ISO date N days from now - used to book against the seed's rolling 90-day availability window. */
export function daysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
