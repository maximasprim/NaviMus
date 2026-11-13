import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  adminCreateUserSchema,
  adminLoginSchema,
  adminUpdateUserSchema,
  loginSchema,
  refreshTokenSchema,
  registerSchema,
  requestPasswordResetSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from "@travel/validation";
import { ok, paginated } from "@travel/http";
import { clearSessionCookies, isCookieMode, readRefreshCookie, requireAuth, requirePermissions, setSessionCookies } from "@travel/auth";
import { AuthenticationError, AuthorizationError, NotFoundError, ValidationError } from "@travel/types";
import type { AuthService } from "./services/auth-service.js";
import type { UserRepository } from "./repositories/user-repository.js";

const adminListUsersSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  status: z.enum(["active", "suspended", "deactivated"]).optional(),
  tenantId: z.string().uuid().optional(),
  deleted: z.enum(["true", "false"]).default("false"),
});
const adminSetUserStatusSchema = z.object({ status: z.enum(["active", "suspended", "deactivated"]) });
const adminSetUserRoleSchema = z.object({ role: z.string().min(1) });

const bodyTokenSchema = z.object({ refreshToken: z.string().min(1).optional() });

/** Runs a callback with cross-tenant database access (bypass RLS). Injected so this module stays DB-agnostic; defaults to a plain call (tests, single-tenant use). */
export type RunPrivileged = <T>(fn: () => Promise<T>) => Promise<T>;

export function buildAuthRoutes(authService: AuthService, users: UserRepository, runPrivileged: RunPrivileged = (fn) => fn()) {
  const app = new Hono();

  app.post("/register", zValidator("json", registerSchema), async (c) => {
    const input = c.req.valid("json");
    const result = await authService.register(input, c.get("tenantId"));
    return ok(c, result, undefined, 201);
  });

  app.post("/login", zValidator("json", loginSchema), async (c) => {
    const input = c.req.valid("json");
    const tokens = await authService.login(input, c.get("tenantId"));
    // Browser clients ask for cookie mode: the tokens go ONLY into httpOnly
    // cookies and never into the response body, where page JS could read them.
    if (isCookieMode(c)) {
      setSessionCookies(c, tokens);
      return ok(c, { authenticated: true });
    }
    return ok(c, tokens);
  });

  // Admin-console sign-in: no tenant is named - the account is found by email and the
  // response says which tenant/role it is. The gateway exempts this path from tenant
  // resolution (like /platform), hence the explicit bypass-RLS context here.
  app.post("/admin-login", zValidator("json", adminLoginSchema), async (c) => {
    const input = c.req.valid("json");
    const result = await runPrivileged(() => authService.adminLogin(input));
    const who = { tenant: result.tenant, roles: result.roles, isPlatformAdmin: result.isPlatformAdmin };
    if (isCookieMode(c)) {
      setSessionCookies(c, result.tokens);
      return ok(c, { authenticated: true, ...who });
    }
    return ok(c, { ...result.tokens, ...who });
  });

  // The refresh token comes from the (path-scoped, httpOnly) cookie for browsers,
  // or from the body for API clients. Rotation happens either way.
  // (Body parsed by hand: cookie-mode callers send no body at all, which a
  // JSON validator would reject as malformed.)
  app.post("/refresh", async (c) => {
    const cookieMode = isCookieMode(c);
    const body = bodyTokenSchema.safeParse(await c.req.json().catch(() => ({})));
    const presented = cookieMode ? readRefreshCookie(c) : body.success ? body.data.refreshToken : undefined;
    if (!presented) throw new AuthenticationError("Missing refresh token");
    let tokens;
    try {
      tokens = await authService.refresh(presented);
    } catch (err) {
      // A dead session shouldn't leave dead cookies behind.
      if (cookieMode) clearSessionCookies(c);
      throw err;
    }
    if (cookieMode) {
      setSessionCookies(c, tokens);
      return ok(c, { authenticated: true });
    }
    return ok(c, tokens);
  });

  // Ends the session server-side (revokes the whole token family) and clears the cookies.
  app.post("/logout", async (c) => {
    const body = bodyTokenSchema.safeParse(await c.req.json().catch(() => ({})));
    const presented = readRefreshCookie(c) ?? (body.success ? body.data.refreshToken : undefined);
    await authService.logout(presented);
    clearSessionCookies(c);
    return ok(c, { loggedOut: true });
  });

  app.get("/me", requireAuth, async (c) => {
    const authUser = c.get("authUser");
    const user = await users.findById(authUser.sub);
    if (!user) return ok(c, null);
    const { passwordHash, mfaSecret, ...safe } = user;
    // roles/permissions come from the verified access token - exactly what the API's own guards check - so the
    // admin console can show each person only the menus their role can actually use. Additive: existing fields unchanged.
    return ok(c, { ...safe, roles: authUser.roles, permissions: authUser.permissions });
  });

  // Always returns 200 regardless of whether the email exists - see
  // AuthService.requestPasswordReset's doc comment for why.
  app.post("/password/forgot", zValidator("json", requestPasswordResetSchema), async (c) => {
    const { email } = c.req.valid("json");
    await authService.requestPasswordReset(email, c.get("tenantId"));
    return ok(c, { message: "If that email exists, a reset link has been sent." });
  });

  app.post("/password/reset", zValidator("json", resetPasswordSchema), async (c) => {
    const { token, newPassword } = c.req.valid("json");
    await authService.resetPassword(token, newPassword);
    return ok(c, { message: "Password updated. You can now log in." });
  });

  app.post("/email/verify", zValidator("json", verifyEmailSchema), async (c) => {
    const { token } = c.req.valid("json");
    await authService.verifyEmail(token);
    return ok(c, { message: "Email verified." });
  });

  app.post("/email/resend-verification", requireAuth, async (c) => {
    const authUser = c.get("authUser");
    const user = await users.findById(authUser.sub);
    if (!user) return ok(c, { message: "If your account needs verification, a new link has been sent." });
    if (user.emailVerifiedAt) return ok(c, { message: "Your email is already verified." });
    await authService.requestEmailVerification(c.get("tenantId"), user.id, user.email);
    return ok(c, { message: "Verification email sent." });
  });

  // --- Admin: user management (spec sections 27 & 44) ---
  // A super_admin sees/manages users across every tenant; a tenant-scoped admin is restricted to their own
  // tenant (resolved from the request's tenant context, which enforceTenantMatch at the gateway already
  // guarantees matches their own token). Every change is written to the audit log.
  /** The :id path segment as a string. (Hono can't infer it through these guard middlewares, so it types as string | undefined.) */
  function idParam(c: any): string {
    const id = c.req.param("id") as string | undefined;
    if (!id) throw new ValidationError("Missing id");
    return id;
  }
  const isPlatformAdmin = (c: any): boolean => c.get("authUser").roles.includes("super_admin");

  /** Loads the target user (404 if outside the caller's reach) and refuses a tenant admin touching a platform admin. */
  async function loadManageable(c: any, id: string) {
    const target = await users.getDetail(id, isPlatformAdmin(c) ? null : c.get("tenantId"));
    if (!target) throw new NotFoundError("User");
    if (target.roles.includes("super_admin") && !isPlatformAdmin(c)) {
      throw new AuthorizationError("Only a platform admin can change a platform admin");
    }
    return target;
  }
  function refuseSelf(c: any, id: string, what: string) {
    if (c.get("authUser").sub === id) throw new ValidationError(`You can't ${what} your own account`);
  }

  app.get("/admin/users", requireAuth, requirePermissions("user:manage"), zValidator("query", adminListUsersSchema), async (c) => {
    const { page, pageSize, search, status, tenantId: tenantFilter, deleted } = c.req.valid("query");
    const platform = isPlatformAdmin(c);
    // Platform admin: every tenant, or one when asked. Tenant admin: always only their own.
    const tenantId = platform ? tenantFilter ?? null : c.get("tenantId");
    const { items, total } = await users.listAll(tenantId, page, pageSize, search, status, deleted === "true");
    return paginated(c, items, page, pageSize, total);
  });

  app.post("/admin/users", requireAuth, requirePermissions("user:manage"), zValidator("json", adminCreateUserSchema), async (c) => {
    const input = c.req.valid("json");
    const authUser = c.get("authUser");
    const platform = isPlatformAdmin(c);
    const tenantId = platform && input.tenantId ? input.tenantId : c.get("tenantId");
    const result = await runPrivileged(() =>
      authService.adminCreateUser(tenantId, input, { userId: authUser.sub, isPlatformAdmin: platform })
    );
    return ok(c, result, undefined, 201);
  });

  app.get("/admin/users/:id", requireAuth, requirePermissions("user:manage"), async (c) => {
    const id = c.req.param("id");
    if (!id) return c.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Missing id" } }, 400);
    const detail = await users.getDetail(id, isPlatformAdmin(c) ? null : c.get("tenantId"));
    if (!detail) return c.json({ success: false, error: { code: "NOT_FOUND", message: "User not found" } }, 404);
    return ok(c, detail);
  });

  app.patch("/admin/users/:id", requireAuth, requirePermissions("user:manage"), zValidator("json", adminUpdateUserSchema), async (c) => {
    const id = idParam(c);
    const patch = c.req.valid("json");
    const target = await loadManageable(c, id);
    if (patch.email && patch.email !== target.email) {
      const clash = await users.findByEmail(target.tenantId, patch.email);
      if (clash && clash.id !== id) throw new ValidationError("Another account in this tenant already uses that email");
    }
    await users.updateProfile(id, target.tenantId, patch);
    await users.writeAudit({
      tenantId: target.tenantId,
      actorUserId: c.get("authUser").sub,
      action: "user.updated",
      resourceId: id,
      metadata: { fields: Object.keys(patch) },
    });
    return ok(c, { message: "User updated" });
  });

  app.delete("/admin/users/:id", requireAuth, requirePermissions("user:manage"), async (c) => {
    const id = idParam(c);
    refuseSelf(c, id, "delete");
    const target = await loadManageable(c, id);
    await users.softDelete(id, target.tenantId);
    await users.writeAudit({
      tenantId: target.tenantId,
      actorUserId: c.get("authUser").sub,
      action: "user.deleted",
      resourceId: id,
      metadata: { email: target.email },
    });
    return ok(c, { message: "User deleted" });
  });

  app.post("/admin/users/:id/restore", requireAuth, requirePermissions("user:manage"), async (c) => {
    const id = idParam(c);
    const gone = await users.findDeletedTenant(id, isPlatformAdmin(c) ? null : c.get("tenantId"));
    if (!gone) throw new NotFoundError("Deleted user");
    await users.restore(id, gone.tenantId);
    await users.writeAudit({
      tenantId: gone.tenantId,
      actorUserId: c.get("authUser").sub,
      action: "user.restored",
      resourceId: id,
      metadata: { email: gone.email },
    });
    return ok(c, { message: "User restored (suspended until you reactivate them)" });
  });

  app.patch(
    "/admin/users/:id/status",
    requireAuth,
    requirePermissions("user:manage"),
    zValidator("json", adminSetUserStatusSchema),
    async (c) => {
      const id = idParam(c);
      const { status } = c.req.valid("json");
      if (status !== "active") refuseSelf(c, id, "suspend or deactivate");
      const target = await loadManageable(c, id);
      const changed = await users.setStatus(id, target.tenantId, status);
      if (!changed) return c.json({ success: false, error: { code: "NOT_FOUND", message: "User not found" } }, 404);
      await users.writeAudit({
        tenantId: target.tenantId,
        actorUserId: c.get("authUser").sub,
        action: `user.${status}`,
        resourceId: id,
      });
      return ok(c, { message: "User status updated" });
    }
  );

  app.patch(
    "/admin/users/:id/role",
    requireAuth,
    requirePermissions("user:manage"),
    zValidator("json", adminSetUserRoleSchema),
    async (c) => {
      const id = idParam(c);
      const { role } = c.req.valid("json");
      // Without this a tenant admin could promote anyone (themselves included) to platform admin.
      if (role === "super_admin" && !isPlatformAdmin(c)) throw new AuthorizationError("Only a platform admin can grant platform admin");
      refuseSelf(c, id, "change the role of");
      const target = await loadManageable(c, id);
      const changed = await users.setRole(id, target.tenantId, role);
      if (!changed) return c.json({ success: false, error: { code: "NOT_FOUND", message: "Role not found" } }, 404);
      await users.writeAudit({
        tenantId: target.tenantId,
        actorUserId: c.get("authUser").sub,
        action: "user.role_changed",
        resourceId: id,
        metadata: { from: target.roles, to: role },
      });
      return ok(c, { message: "Role updated" });
    }
  );

  return app;
}
