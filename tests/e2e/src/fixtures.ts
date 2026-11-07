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
export const SEED_ADMIN_EMAIL = "admin@navimus.co.ke";
export const SEED_ADMIN_PASSWORD = "@0743493619Nn";
export const SEED_OPERATOR_EMAIL = "operator@navimus.co.ke";
export const SEED_OPERATOR_PASSWORD = "@0743493619Oo";
export const SEED_CUSTOMER_EMAIL = "customer@navimus.co.ke";
export const SEED_CUSTOMER_PASSWORD = "@0743493619Cc";
export const SEED_TEST_TENANT_ADMIN_EMAIL = "admin@enroute.co.ke";
export const SEED_TEST_TENANT_ADMIN_PASSWORD = "@0743493619Ee";

const SEED_PASSWORDS: Record<string, string> = {
  [SEED_ADMIN_EMAIL]: SEED_ADMIN_PASSWORD,
  [SEED_OPERATOR_EMAIL]: SEED_OPERATOR_PASSWORD,
  [SEED_CUSTOMER_EMAIL]: SEED_CUSTOMER_PASSWORD,
  [SEED_TEST_TENANT_ADMIN_EMAIL]: SEED_TEST_TENANT_ADMIN_PASSWORD,
};
export const SEED_PACKAGE_SLUG = "3-day-maasai-mara-safari-demo";

export async function loginAs(email: string, password: string = SEED_PASSWORDS[email] ?? ""): Promise<string> {
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
