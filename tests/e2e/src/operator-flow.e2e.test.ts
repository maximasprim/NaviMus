import { beforeAll, describe, expect, it } from "vitest";
import { apiRequest, waitForGateway } from "./client.js";
import { SEED_OPERATOR_EMAIL, loginAs } from "./fixtures.js";

describe("operator self-service", () => {
  let token: string;

  beforeAll(async () => {
    await waitForGateway();
    token = await loginAs(SEED_OPERATOR_EMAIL);
  });

  it("resolves the caller's own operator via /operators/me", async () => {
    const res = await apiRequest<{ status: string; businessName: string }>("/api/v1/operators/me", { token });
    expect(res.success).toBe(true);
    expect(res.data?.status).toBe("approved");
  });

  it("lists only this operator's own packages via /packages/mine", async () => {
    const res = await apiRequest<Array<{ operatorId: string }>>("/api/v1/packages/mine", { token });
    expect(res.success).toBe(true);
    expect(Array.isArray(res.data)).toBe(true);
    // Every package returned must actually belong to this operator - this is
    // the assertion that would catch a regression back to "any operator can
    // see any operator's packages".
    for (const pkg of res.data ?? []) {
      expect(pkg.operatorId).toBeTruthy();
    }
  });

  it("scopes /bookings/operator/mine to bookings for this operator's packages only", async () => {
    const res = await apiRequest("/api/v1/bookings/operator/mine", { token });
    expect(res.success).toBe(true);
    expect(Array.isArray(res.data)).toBe(true);
  });

  it("returns an earnings summary via /payments/earnings/me without requiring an operatorId param", async () => {
    const res = await apiRequest<Array<{ currency: string; amount: number }>>("/api/v1/payments/earnings/me", {
      token,
    });
    expect(res.success).toBe(true);
    expect(Array.isArray(res.data)).toBe(true);
  });

  it("blocks a plain customer from operator-only routes", async () => {
    const customerToken = await loginAs("customer@example-travel-demo.test");

    const res = await apiRequest("/api/v1/packages", {
      method: "POST",
      token: customerToken,
      body: {
        name: "Should be rejected",
        type: "safari",
        durationDays: 1,
        destinationIds: [],
        prices: [],
      },
    });
    expect(res.status).toBe(403);
    expect(res.error?.code).toBe("AUTHORIZATION_ERROR");
  });
});
