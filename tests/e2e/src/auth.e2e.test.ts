import { beforeAll, describe, expect, it } from "vitest";
import { apiRequest, uniqueEmail, waitForGateway } from "./client.js";

describe("auth: registration and login", () => {
  beforeAll(async () => {
    await waitForGateway();
  });

  it("registers a new customer, then logs in and can fetch /auth/me", async () => {
    const email = uniqueEmail("e2e-register");
    const password = "Correct-Horse-9!";

    const registerRes = await apiRequest("/api/v1/auth/register", {
      method: "POST",
      body: { email, password, firstName: "E2E", lastName: "Tester" },
    });
    expect(registerRes.status).toBe(201);
    expect(registerRes.success).toBe(true);

    const loginRes = await apiRequest<{ accessToken: string }>("/api/v1/auth/login", {
      method: "POST",
      body: { email, password },
    });
    expect(loginRes.status).toBe(200);
    expect(loginRes.data?.accessToken).toBeTruthy();

    const meRes = await apiRequest<{ email: string }>("/api/v1/auth/me", {
      token: loginRes.data!.accessToken,
    });
    expect(meRes.success).toBe(true);
    expect(meRes.data?.email).toBe(email.toLowerCase());
  });

  it("rejects a login with the wrong password without revealing whether the account exists", async () => {
    const email = uniqueEmail("e2e-wrongpass");
    await apiRequest("/api/v1/auth/register", {
      method: "POST",
      body: { email, password: "Correct-Horse-9!", firstName: "E2E", lastName: "Tester" },
    });

    const res = await apiRequest("/api/v1/auth/login", {
      method: "POST",
      body: { email, password: "Definitely-Wrong-1!" },
    });
    expect(res.status).toBe(401);
    expect(res.error?.code).toBe("AUTHENTICATION_ERROR");
  });

  it("rejects a duplicate registration with a clear conflict error", async () => {
    const email = uniqueEmail("e2e-dupe");
    const body = { email, password: "Correct-Horse-9!", firstName: "E2E", lastName: "Tester" };

    const first = await apiRequest("/api/v1/auth/register", { method: "POST", body });
    expect(first.status).toBe(201);

    const second = await apiRequest("/api/v1/auth/register", { method: "POST", body });
    expect(second.status).toBe(409);
    expect(second.error?.code).toBe("CONFLICT");
  });
});
