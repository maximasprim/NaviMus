import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  loginSchema,
  refreshTokenSchema,
  registerSchema,
  requestPasswordResetSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from "@travel/validation";
import { ok, paginated } from "@travel/http";
import { clearSessionCookies, isCookieMode, readRefreshCookie, requireAuth, requirePermissions, setSessionCookies } from "@travel/auth";
import { AuthenticationError } from "@travel/types";
import type { AuthService } from "./services/auth-service.js";
import type { UserRepository } from "./repositories/user-repository.js";

const adminListUsersSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
});
const adminSetUserStatusSchema = z.object({ status: z.enum(["active", "suspended", "deactivated"]) });
const adminSetUserRoleSchema = z.object({ role: z.string().min(1) });

const bodyTokenSchema = z.object({ refreshToken: z.string().min(1).optional() });

export function buildAuthRoutes(authService: AuthService, users: UserRepository) {
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
    return ok(c, safe);
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
  // A super_admin sees/manages users across every tenant (tenantId -> null,
  // no filter); a tenant-scoped admin is restricted to their own tenant -
  // resolved from the request's tenant context, which enforceTenantMatch
  // (mounted at the gateway) already guarantees matches their own token.
  app.get("/admin/users", requireAuth, requirePermissions("user:manage"), zValidator("query", adminListUsersSchema), async (c) => {
    const { page, pageSize, search } = c.req.valid("query");
    const authUser = c.get("authUser");
    const tenantId = authUser.roles.includes("super_admin") ? null : c.get("tenantId");
    const { items, total } = await users.listAll(tenantId, page, pageSize, search);
    return paginated(c, items, page, pageSize, total);
  });

  app.get("/admin/users/:id", requireAuth, requirePermissions("user:manage"), async (c) => {
    const id = c.req.param("id");
    if (!id) return c.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Missing id" } }, 400);
    const authUser = c.get("authUser");
    const user = authUser.roles.includes("super_admin")
      ? await users.findById(id)
      : await users.findByIdForTenant(id, c.get("tenantId"));
    if (!user) return c.json({ success: false, error: { code: "NOT_FOUND", message: "User not found" } }, 404);
    const { passwordHash, mfaSecret, ...safe } = user;
    const roles = await users.getRoleNames(id);
    return ok(c, { ...safe, roles });
  });

  app.patch(
    "/admin/users/:id/status",
    requireAuth,
    requirePermissions("user:manage"),
    zValidator("json", adminSetUserStatusSchema),
    async (c) => {
      const { id } = c.req.param();
      const { status } = c.req.valid("json");
      const authUser = c.get("authUser");
      const tenantId = authUser.roles.includes("super_admin")
        ? (await users.findById(id))?.tenantId
        : c.get("tenantId");
      if (!tenantId) return c.json({ success: false, error: { code: "NOT_FOUND", message: "User not found" } }, 404);
      const changed = await users.setStatus(id, tenantId, status);
      if (!changed) return c.json({ success: false, error: { code: "NOT_FOUND", message: "User not found" } }, 404);
      return ok(c, { message: "User status updated" });
    }
  );

  app.patch(
    "/admin/users/:id/role",
    requireAuth,
    requirePermissions("user:manage"),
    zValidator("json", adminSetUserRoleSchema),
    async (c) => {
      const { id } = c.req.param();
      const { role } = c.req.valid("json");
      const authUser = c.get("authUser");
      const tenantId = authUser.roles.includes("super_admin")
        ? (await users.findById(id))?.tenantId
        : c.get("tenantId");
      if (!tenantId) return c.json({ success: false, error: { code: "NOT_FOUND", message: "User not found" } }, 404);
      const changed = await users.setRole(id, tenantId, role);
      if (!changed) return c.json({ success: false, error: { code: "NOT_FOUND", message: "Role not found" } }, 404);
      return ok(c, { message: "Role updated" });
    }
  );

  return app;
}
