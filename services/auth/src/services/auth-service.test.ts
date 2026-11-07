import { describe, expect, it, vi } from "vitest";
import { decodeJwt } from "jose";
import { hashPassword } from "@travel/auth";
import { AuthService } from "./auth-service.js";

type Row = { id: string; userId: string; family: string; expiresAt: Date; revokedAt: Date | null };

/** In-memory RefreshTokenRepository with the same atomic-revoke semantics as the SQL. */
function makeTokenRepo() {
  const rows = new Map<string, Row>();
  return {
    rows,
    insert: async (r: { id: string; userId: string; family: string; expiresAt: Date }) => void rows.set(r.id, { ...r, revokedAt: null }),
    findById: async (id: string) => rows.get(id) ?? null,
    revokeIfActive: async (id: string) => {
      const r = rows.get(id);
      if (!r || r.revokedAt) return false;
      r.revokedAt = new Date();
      return true;
    },
    revokeFamily: async (family: string) => rows.forEach((r) => !r.revokedAt && r.family === family && (r.revokedAt = new Date())),
    revokeAllForUser: async (userId: string) => rows.forEach((r) => !r.revokedAt && r.userId === userId && (r.revokedAt = new Date())),
    deleteExpired: vi.fn(async () => undefined),
  };
}

async function setup(userOver: any = {}) {
  const user = { id: "u1", tenantId: "t1", email: "a@b.test", status: "active", passwordHash: await hashPassword("Correct-Horse-9"), ...userOver };
  const users: any = {
    findByEmail: async (_t: string, email: string) => (email === user.email ? user : null),
    findById: async (id: string) => (id === user.id ? user : null),
    getRolesAndPermissions: async () => ({ roles: ["customer"], permissions: [] }),
    updatePassword: vi.fn(async () => undefined),
    findValidPasswordResetToken: async () => ({ id: "r1", userId: user.id }),
    consumePasswordResetToken: async () => undefined,
  };
  const tokens = makeTokenRepo();
  const svc = new AuthService(users, { publish: async () => undefined } as any, tokens as any);
  return { svc, tokens, user };
}
const login = (svc: AuthService) => svc.login({ email: "a@b.test", password: "Correct-Horse-9" } as any, "t1");
const jtiOf = (t: string) => decodeJwt(t).jti as string;

describe("sessions: login and rotation", () => {
  it("login records the refresh token (jti) so it can later be revoked", async () => {
    const { svc, tokens } = await setup();
    const { refreshToken } = await login(svc);
    const row = tokens.rows.get(jtiOf(refreshToken))!;
    expect(row).toMatchObject({ userId: "u1", revokedAt: null });
    expect(row.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("refresh ROTATES: the old token is revoked, a new one issued in the same family", async () => {
    const { svc, tokens } = await setup();
    const first = await login(svc);
    const second = await svc.refresh(first.refreshToken);
    expect(second.refreshToken).not.toBe(first.refreshToken);
    expect(tokens.rows.get(jtiOf(first.refreshToken))!.revokedAt).not.toBeNull();
    expect(tokens.rows.get(jtiOf(second.refreshToken))!.family).toBe(tokens.rows.get(jtiOf(first.refreshToken))!.family);
    await expect(svc.refresh(second.refreshToken)).resolves.toBeTruthy(); // the new one works
  });

  it("a legacy stateless token (no jti) and an unknown jti are refused", async () => {
    const { svc } = await setup();
    const { SignJWT } = await import("jose");
    const secret = new TextEncoder().encode("test-refresh-secret-test-refresh-1234");
    const legacy = await new SignJWT({ sub: "u1", tokenFamily: "f" }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("1h").sign(secret);
    const forged = await new SignJWT({ sub: "u1", tokenFamily: "f" }).setProtectedHeader({ alg: "HS256" }).setJti("11111111-1111-1111-1111-111111111111").setExpirationTime("1h").sign(secret);
    await expect(svc.refresh(legacy)).rejects.toThrow(/expired/i);
    await expect(svc.refresh(forged)).rejects.toThrow(/expired/i);
  });

  it("two concurrent refreshes with the same token: exactly one wins the rotation", async () => {
    const { svc } = await setup();
    const { refreshToken } = await login(svc);
    const results = await Promise.allSettled([svc.refresh(refreshToken), svc.refresh(refreshToken), svc.refresh(refreshToken)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });
});

describe("sessions: theft and revocation", () => {
  it("REUSE of a rotated token (outside the race window) revokes the whole family - including the thief's AND the victim's newest token", async () => {
    const { svc, tokens } = await setup();
    const first = await login(svc);
    const second = await svc.refresh(first.refreshToken); // legitimate rotation
    tokens.rows.get(jtiOf(first.refreshToken))!.revokedAt = new Date(Date.now() - 60_000); // long ago
    await expect(svc.refresh(first.refreshToken)).rejects.toThrow(/expired/i); // attacker replays the old token
    await expect(svc.refresh(second.refreshToken)).rejects.toThrow(/expired/i); // family burned: victim must sign in again
  });

  it("a duplicate within the grace window (two tabs) is refused WITHOUT burning the session", async () => {
    const { svc } = await setup();
    const first = await login(svc);
    const second = await svc.refresh(first.refreshToken);
    await expect(svc.refresh(first.refreshToken)).rejects.toThrow(/expired/i); // loser of the race
    await expect(svc.refresh(second.refreshToken)).resolves.toBeTruthy(); // winner's session intact
  });

  it("a user deactivated after login can no longer refresh, and their session is revoked", async () => {
    const { svc, user } = await setup();
    const { refreshToken } = await login(svc);
    user.status = "suspended";
    await expect(svc.refresh(refreshToken)).rejects.toThrow(/not active/i);
  });

  it("logout revokes the whole family; a second logout or garbage token doesn't throw", async () => {
    const { svc, tokens } = await setup();
    const first = await login(svc);
    const second = await svc.refresh(first.refreshToken);
    await svc.logout(second.refreshToken);
    expect([...tokens.rows.values()].every((r) => r.revokedAt)).toBe(true);
    await expect(svc.refresh(second.refreshToken)).rejects.toThrow();
    await expect(svc.logout(second.refreshToken)).resolves.toBeUndefined();
    await expect(svc.logout("garbage")).resolves.toBeUndefined();
    await expect(svc.logout(undefined)).resolves.toBeUndefined();
  });

  it("resetting the password ends every session the user has", async () => {
    const { svc, tokens } = await setup();
    await login(svc);
    await login(svc); // two devices
    await svc.resetPassword("raw-reset-token", "New-Passw0rd!1");
    expect([...tokens.rows.values()].every((r) => r.revokedAt)).toBe(true);
  });
});

describe("adminLogin: sign in to the admin console without naming a tenant", () => {
  type Cand = { user: any; tenant: { id: string; slug: string; name: string; status: string }; roles: string[] };

  async function cand(over: { id: string; slug: string; roles: string[]; password?: string; userStatus?: string; tenantStatus?: string; email?: string }): Promise<Cand> {
    return {
      user: {
        id: over.id,
        tenantId: `t-${over.slug}`,
        email: over.email ?? "boss@x.test",
        status: over.userStatus ?? "active",
        passwordHash: await hashPassword(over.password ?? "Correct-Horse-9"),
      },
      tenant: { id: `t-${over.slug}`, slug: over.slug, name: over.slug.toUpperCase(), status: over.tenantStatus ?? "active" },
      roles: over.roles,
    };
  }

  function build(cands: Cand[]) {
    const users: any = {
      findAllByEmailWithTenant: async (email: string) => cands.filter((c) => c.user.email === email).map(({ user, tenant }) => ({ user, tenant })),
      getRolesAndPermissions: async (id: string) => ({ roles: cands.find((c) => c.user.id === id)!.roles, permissions: [] }),
    };
    return new AuthService(users, { publish: async () => undefined } as any, makeTokenRepo() as any);
  }
  const input = (extra: object = {}) => ({ email: "boss@x.test", password: "Correct-Horse-9", ...extra });

  it("signs a platform admin in and reports the default tenant + isPlatformAdmin", async () => {
    const svc = build([await cand({ id: "u1", slug: "default", roles: ["super_admin"] })]);
    const r = await svc.adminLogin(input());
    expect(r.isPlatformAdmin).toBe(true);
    expect(r.tenant.slug).toBe("default");
    expect(decodeJwt(r.tokens.accessToken)).toMatchObject({ sub: "u1", tenantId: "t-default" });
  });

  it("signs a tenant admin in and reports THEIR tenant, not the platform's", async () => {
    const svc = build([await cand({ id: "u2", slug: "acme", roles: ["admin"] })]);
    const r = await svc.adminLogin(input());
    expect(r.isPlatformAdmin).toBe(false);
    expect(r.tenant.slug).toBe("acme");
  });

  it("gives the SAME generic error for unknown email, wrong password and non-staff accounts", async () => {
    const svc = build([
      await cand({ id: "u3", slug: "acme", roles: ["admin"] }),
      await cand({ id: "u4", slug: "acme", roles: ["customer"], email: "cust@x.test" }),
    ]);
    const msg = /Invalid email or password/;
    await expect(svc.adminLogin(input({ email: "nobody@x.test" }))).rejects.toThrow(msg);
    await expect(svc.adminLogin(input({ password: "wrong" }))).rejects.toThrow(msg);
    await expect(svc.adminLogin(input({ email: "cust@x.test" }))).rejects.toThrow(msg); // right password, but a customer
  });

  it("refuses a suspended tenant's admin, but never a platform admin", async () => {
    const suspended = build([await cand({ id: "u5", slug: "acme", roles: ["admin"], tenantStatus: "suspended" })]);
    await expect(suspended.adminLogin(input())).rejects.toThrow(/suspended/i);
    const platform = build([await cand({ id: "u6", slug: "default", roles: ["super_admin"], tenantStatus: "suspended" })]);
    await expect(platform.adminLogin(input())).resolves.toBeTruthy();
  });

  it("refuses an inactive account", async () => {
    const svc = build([await cand({ id: "u7", slug: "acme", roles: ["admin"], userStatus: "suspended" })]);
    await expect(svc.adminLogin(input())).rejects.toThrow(/not active/i);
  });

  it("same email+password as staff in two tenants: asks for the workspace, then honours it", async () => {
    const svc = build([
      await cand({ id: "a", slug: "acme", roles: ["admin"] }),
      await cand({ id: "b", slug: "globex", roles: ["admin"] }),
    ]);
    await expect(svc.adminLogin(input())).rejects.toMatchObject({ code: "WORKSPACE_REQUIRED" });
    const r = await svc.adminLogin(input({ workspace: "globex" }));
    expect(r.tenant.slug).toBe("globex");
  });

  it("only the matching password counts when the same email is staff in two tenants", async () => {
    const svc = build([
      await cand({ id: "a", slug: "acme", roles: ["admin"], password: "Other-Passw0rd-1" }),
      await cand({ id: "b", slug: "globex", roles: ["admin"] }),
    ]);
    const r = await svc.adminLogin(input()); // password only matches globex, so no ambiguity
    expect(r.tenant.slug).toBe("globex");
  });

  it("a super_admin match wins over a tenant-admin match for the same credentials", async () => {
    const svc = build([
      await cand({ id: "a", slug: "acme", roles: ["admin"] }),
      await cand({ id: "p", slug: "default", roles: ["super_admin"] }),
    ]);
    const r = await svc.adminLogin(input());
    expect(r.isPlatformAdmin).toBe(true);
  });
});
