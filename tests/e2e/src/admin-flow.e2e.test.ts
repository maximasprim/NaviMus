import { beforeAll, describe, expect, it } from "vitest";
import { apiRequest, uniqueEmail, waitForGateway } from "./client.js";
import { SEED_ADMIN_EMAIL, loginAs } from "./fixtures.js";

describe("admin: dashboard metrics and operator approval", () => {
  let adminToken: string;

  beforeAll(async () => {
    await waitForGateway();
    adminToken = await loginAs(SEED_ADMIN_EMAIL);
  });

  it("returns dashboard metrics computed from real booking/ledger data, not placeholders", async () => {
    const res = await apiRequest<{
      bookings: { total: number; byStatus: Record<string, number> };
      revenue: { grossRevenue: number };
      activeDestinations: number;
    }>("/api/v1/admin/dashboard", { token: adminToken });
    expect(res.success).toBe(true);
    expect(typeof res.data?.bookings.total).toBe("number");
    expect(typeof res.data?.revenue.grossRevenue).toBe("number");
    // The seed always publishes at least the two demo destinations.
    expect(res.data!.activeDestinations).toBeGreaterThanOrEqual(2);
  });

  it("approves a newly registered operator end to end", async () => {
    const email = uniqueEmail("e2e-newoperator");
    const password = "Correct-Horse-9!";
    await apiRequest("/api/v1/auth/register", {
      method: "POST",
      body: { email, password, firstName: "New", lastName: "Operator" },
    });
    const newOperatorToken = await loginAs(email, password);

    const registerRes = await apiRequest<{ id: string; status: string }>("/api/v1/operators", {
      method: "POST",
      token: newOperatorToken,
      body: { businessName: `E2E Test Operator ${Date.now()}`, contactEmail: email },
    });
    expect(registerRes.status).toBe(201);
    expect(registerRes.data?.status).toBe("pending");
    const operatorId = registerRes.data!.id;

    // Before approval: the operator-gated package-creation route must
    // still reject this user, since they don't hold tour_operator yet -
    // this is the exact regression the missing-role-grant bug caused.
    const beforeApprovalRes = await apiRequest("/api/v1/packages", {
      method: "POST",
      token: newOperatorToken,
      body: { name: "x", type: "safari", durationDays: 1, destinationIds: [], prices: [] },
    });
    expect(beforeApprovalRes.status).toBe(403);

    const reviewRes = await apiRequest<{ status: string }>(`/api/v1/operators/${operatorId}/review`, {
      method: "POST",
      token: adminToken,
      body: { decision: "approved" },
    });
    expect(reviewRes.status).toBe(200);
    expect(reviewRes.data?.status).toBe("approved");

    // After approval, the SAME user must now hold tour_operator - proven by
    // /operators/me succeeding with a fresh token reflecting the new role.
    const freshToken = await loginAs(email, password);
    const meRes = await apiRequest<{ status: string }>("/api/v1/operators/me", { token: freshToken });
    expect(meRes.data?.status).toBe("approved");
  });

  it("blocks a non-admin from the dashboard", async () => {
    const customerToken = await loginAs("customer@example-travel-demo.test");
    const res = await apiRequest("/api/v1/admin/dashboard", { token: customerToken });
    expect(res.status).toBe(403);
  });
});
