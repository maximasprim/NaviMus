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
