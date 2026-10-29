import { randomUUID, randomBytes, createHash } from "node:crypto";
import {
  hashPassword,
  verifyPassword,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  ttlToSeconds,
} from "@travel/auth";
import { env } from "@travel/config";
import { createServiceLogger } from "@travel/logger";
import { AuthenticationError, ConflictError, NotFoundError, ValidationError } from "@travel/types";
import type { LoginInput, RegisterInput } from "@travel/validation";
import type { EventPublisher } from "@travel/events";
import type { UserRepository } from "../repositories/user-repository.js";
import type { RefreshTokenRepository } from "../repositories/refresh-token-repository.js";

const logger = createServiceLogger("auth-service");

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
/**
 * Two tabs (or a retry) can present the same refresh token within moments of
 * each other; the loser finds it already rotated. Within this window that is
 * treated as a harmless race and simply refused. Beyond it, presenting a
 * rotated token means a copy leaked, and the whole session family is revoked.
 */
const REUSE_GRACE_MS = 10_000;

function generateToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString("hex");
  const hash = createHash("sha256").update(raw).digest("hex");
  return { raw, hash };
}

/**
 * Business logic for registration/login/token refresh. Kept out
 * of the route handlers per rule #18, and depends only on the
 * repository interface rather than touching Drizzle directly.
 */
export class AuthService {
  constructor(
    private readonly users: UserRepository,
    private readonly events: EventPublisher,
    private readonly refreshTokens: RefreshTokenRepository
  ) {}

  async register(input: RegisterInput, tenantId: string): Promise<{ userId: string }> {
    const existing = await this.users.findByEmail(tenantId, input.email);
    if (existing) {
      throw new ConflictError("An account with this email already exists");
    }

    const passwordHash = await hashPassword(input.password);
    const user = await this.users.create({
      tenantId,
      email: input.email,
      passwordHash,
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone,
      nationality: input.nationality,
    });
    await this.users.assignDefaultCustomerRole(user.id);

    await this.events.publish("user.created", { userId: user.id, tenantId, email: user.email });
    // Registration also kicks off email verification - see requestEmailVerification's
    // doc comment for why this reuses the same token machinery as password reset.
    await this.requestEmailVerification(tenantId, user.id, user.email);

    return { userId: user.id };
  }

  /**
   * Distinct from the public self-service `register` above: used
   * exclusively by the platform (super_admin) tenant-creation flow
   * (services/admin's TenantService, via @travel/service-auth/internal)
   * to create a brand-new tenant's very first user. Two real
   * differences from `register`: the new user gets the "admin" role
   * for their own tenant, not "customer" - they need to actually run
   * their business from day one - and this never throws on an
   * existing email the way register() does for a *different* reason:
   * emails are unique per-tenant (see users' schema comment), and this
   * tenant was just created, so a collision here would mean two
   * requests raced to create the same tenant twice, not a real signup
   * conflict. The email-uniqueness check still runs (defense in
   * depth), it just can't legitimately fire in the normal flow.
   */
  async createTenantOwner(tenantId: string, input: RegisterInput): Promise<{ userId: string }> {
    const existing = await this.users.findByEmail(tenantId, input.email);
    if (existing) {
      throw new ConflictError("An account with this email already exists for this tenant");
    }

    const passwordHash = await hashPassword(input.password);
    const user = await this.users.create({
      tenantId,
      email: input.email,
      passwordHash,
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone,
      nationality: input.nationality,
    });

    const roleAssigned = await this.users.setRole(user.id, tenantId, "admin");
    if (!roleAssigned) {
      // Should never happen against a correctly-seeded database (see
      // seed/index.ts) - surfacing loudly rather than silently leaving
      // the tenant's first user without any role at all.
      throw new ConflictError('Could not assign the "admin" role - is the roles table seeded?');
    }

    await this.events.publish("user.created", { userId: user.id, tenantId, email: user.email });
    await this.requestEmailVerification(tenantId, user.id, user.email);

    return { userId: user.id };
  }

  async login(input: LoginInput, tenantId: string): Promise<AuthTokens> {
    const user = await this.users.findByEmail(tenantId, input.email);
    if (!user) {
      // Same error for "no such user" and "wrong password" - never reveal which.
      throw new AuthenticationError("Invalid email or password");
    }
    const valid = await verifyPassword(user.passwordHash, input.password);
    if (!valid) {
      throw new AuthenticationError("Invalid email or password");
    }
    if (user.status !== "active") {
      throw new AuthenticationError("This account is not active");
    }

    // Occasional housekeeping so the table doesn't grow without bound.
    if (Math.random() < 0.01) await this.refreshTokens.deleteExpired();

    return this.issueTokens(user.id, user.tenantId, user.email);
  }

  /**
   * Exchanges a refresh token for a new pair, ROTATING it: the presented token
   * is revoked and a new one issued in the same family. A revoked token shown
   * again outside the race window means it was copied, so the whole family
   * (every token descended from that login) is revoked. A deactivated user can
   * no longer refresh - this used to only re-read the user and carry on, so a
   * suspended account kept its session for up to 30 days.
   */
  async refresh(refreshToken: string): Promise<AuthTokens> {
    const payload = await verifyRefreshToken(refreshToken);
    const expired = () => new AuthenticationError("Your session has expired. Please sign in again.");

    // Tokens minted before sessions were tracked carry no jti: they can't be
    // revoked, so they aren't honoured - the user signs in once more.
    if (!payload.jti) throw expired();
    const row = await this.refreshTokens.findById(payload.jti);
    if (!row || row.userId !== payload.sub) throw expired();

    if (row.revokedAt) {
      if (Date.now() - row.revokedAt.getTime() > REUSE_GRACE_MS) {
        await this.refreshTokens.revokeFamily(row.family);
        logger.warn({ userId: row.userId, family: row.family }, "Refresh token reuse detected - session family revoked");
      }
      throw expired();
    }
    if (row.expiresAt.getTime() <= Date.now()) throw expired();

    const user = await this.users.findById(payload.sub);
    if (!user || user.status !== "active") {
      await this.refreshTokens.revokeFamily(row.family);
      throw new AuthenticationError("This account is not active");
    }

    // Claim the rotation atomically: if a concurrent refresh already did, we lose.
    if (!(await this.refreshTokens.revokeIfActive(row.id))) throw expired();
    return this.issueTokens(user.id, user.tenantId, user.email, row.family);
  }

  /** Ends the session this refresh token belongs to (every token in its family). Never throws: logging out an already-dead session is fine. */
  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;
    try {
      const payload = await verifyRefreshToken(refreshToken);
      if (!payload.jti) return;
      const row = await this.refreshTokens.findById(payload.jti);
      if (row) await this.refreshTokens.revokeFamily(row.family);
    } catch {
      /* invalid/expired token: nothing to revoke */
    }
  }

  /**
   * Always succeeds from the caller's point of view, even for an
   * unknown email - the route must never reveal whether an account
   * exists (same "don't leak account existence" principle as login's
   * shared error message). If the email does exist, a single-use,
   * hashed, 1-hour-expiry token is stored and a
   * `user.password_reset_requested` event is published with the raw
   * token so the notification worker can email a reset link - the raw
   * token never touches the database, only its hash does.
   */
  async requestPasswordReset(email: string, tenantId: string): Promise<void> {
    const user = await this.users.findByEmail(tenantId, email);
    if (!user) return; // Deliberately silent - see doc comment.

    const { raw, hash } = generateToken();
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);
    await this.users.createPasswordResetToken(user.id, hash, expiresAt);
    await this.events.publish("user.password_reset_requested", {
      tenantId,
      userId: user.id,
      email: user.email,
      resetToken: raw,
      expiresAt: expiresAt.toISOString(),
    });
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const hash = createHash("sha256").update(token).digest("hex");
    const record = await this.users.findValidPasswordResetToken(hash);
    if (!record) {
      throw new ValidationError("This reset link is invalid or has expired");
    }
    const passwordHash = await hashPassword(newPassword);
    await this.users.updatePassword(record.userId, passwordHash);
    await this.users.consumePasswordResetToken(record.id);
    // Someone who resets their password usually does so because the old one
    // (and possibly a session) is compromised: end every existing session.
    await this.refreshTokens.revokeAllForUser(record.userId);
  }

  /** Same token-hashing approach as requestPasswordReset, with a 24-hour expiry. */
  async requestEmailVerification(tenantId: string, userId: string, email: string): Promise<void> {
    const { raw, hash } = generateToken();
    const expiresAt = new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS);
    await this.users.createEmailVerificationToken(userId, hash, expiresAt);
    await this.events.publish("user.email_verification_requested", {
      tenantId,
      userId,
      email,
      verificationToken: raw,
      expiresAt: expiresAt.toISOString(),
    });
  }

  async verifyEmail(token: string): Promise<void> {
    const hash = createHash("sha256").update(token).digest("hex");
    const record = await this.users.findValidEmailVerificationToken(hash);
    if (!record) {
      throw new ValidationError("This verification link is invalid or has expired");
    }
    await this.users.markEmailVerified(record.userId);
    await this.users.consumeEmailVerificationToken(record.id);
  }

  private async issueTokens(userId: string, tenantId: string, email: string, family: string = randomUUID()): Promise<AuthTokens> {
    const { roles, permissions } = await this.users.getRolesAndPermissions(userId);
    const accessToken = await signAccessToken({ sub: userId, tenantId, email, roles, permissions });
    const jti = randomUUID();
    await this.refreshTokens.insert({
      id: jti,
      userId,
      family,
      expiresAt: new Date(Date.now() + ttlToSeconds(env.JWT_REFRESH_TTL) * 1000),
    });
    const refreshToken = await signRefreshToken({ sub: userId, tokenFamily: family }, jti);
    return { accessToken, refreshToken };
  }
}
