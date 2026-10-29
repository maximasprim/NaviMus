import { and, desc, eq, gt, ilike, isNull, or, schema, sql, type Database } from "@travel/database";

/**
 * Thin data-access layer. Route handlers and the AuthService
 * never write raw Drizzle queries directly - everything routes
 * through here so the query shape for "users" lives in one place.
 */
export class UserRepository {
  constructor(private readonly db: Database) {}

  async findByEmail(tenantId: string, email: string) {
    const [user] = await this.db
      .select()
      .from(schema.users)
      .where(and(eq(schema.users.tenantId, tenantId), eq(schema.users.email, email), isNull(schema.users.deletedAt)))
      .limit(1);
    return user ?? null;
  }

  /**
   * Looks up by id alone (no tenant filter) - used for self-lookups (/me,
   * refresh) where the caller's own token.sub already scopes identity, and
   * ids are globally unique UUIDs so there's no cross-tenant ambiguity to
   * resolve. Anywhere a *different* user's id is looked up on behalf of an
   * admin (see findByIdForTenant below) must go through the tenant-scoped
   * variant instead, or a tenant-A admin could probe tenant-B user ids.
   */
  async findById(id: string) {
    const [user] = await this.db
      .select()
      .from(schema.users)
      .where(and(eq(schema.users.id, id), isNull(schema.users.deletedAt)))
      .limit(1);
    return user ?? null;
  }

  /** Tenant-scoped variant of findById, for admin endpoints acting on a specific user. */
  async findByIdForTenant(id: string, tenantId: string) {
    const [user] = await this.db
      .select()
      .from(schema.users)
      .where(and(eq(schema.users.id, id), eq(schema.users.tenantId, tenantId), isNull(schema.users.deletedAt)))
      .limit(1);
    return user ?? null;
  }

  async create(input: {
    tenantId: string;
    email: string;
    passwordHash: string;
    firstName: string;
    lastName: string;
    phone?: string;
    nationality?: string;
  }) {
    const [user] = await this.db.insert(schema.users).values(input).returning();
    return user!;
  }

  /** Returns the union of role names and permission codes held by a user, for JWT claims. */
  async getRolesAndPermissions(userId: string): Promise<{ roles: string[]; permissions: string[] }> {
    const rows = await this.db
      .select({
        roleName: schema.roles.name,
        permissionCode: schema.permissions.code,
      })
      .from(schema.userRoles)
      .innerJoin(schema.roles, eq(schema.userRoles.roleId, schema.roles.id))
      .leftJoin(schema.rolePermissions, eq(schema.rolePermissions.roleId, schema.roles.id))
      .leftJoin(schema.permissions, eq(schema.rolePermissions.permissionId, schema.permissions.id))
      .where(eq(schema.userRoles.userId, userId));

    const roles = new Set<string>();
    const permissions = new Set<string>();
    for (const row of rows) {
      roles.add(row.roleName);
      if (row.permissionCode) permissions.add(row.permissionCode);
    }
    return { roles: [...roles], permissions: [...permissions] };
  }

  async assignDefaultCustomerRole(userId: string) {
    const [customerRole] = await this.db
      .select()
      .from(schema.roles)
      .where(eq(schema.roles.name, "customer"))
      .limit(1);
    if (!customerRole) return;
    await this.db.insert(schema.userRoles).values({ userId, roleId: customerRole.id });
  }

  async updatePassword(userId: string, passwordHash: string) {
    await this.db.update(schema.users).set({ passwordHash, updatedAt: new Date() }).where(eq(schema.users.id, userId));
  }

  async markEmailVerified(userId: string) {
    await this.db.update(schema.users).set({ emailVerifiedAt: new Date(), updatedAt: new Date() }).where(eq(schema.users.id, userId));
  }

  /** Stores the SHA-256 hash of a password-reset token - see the doc comment on `password_reset_tokens`. */
  async createPasswordResetToken(userId: string, tokenHash: string, expiresAt: Date) {
    await this.db.insert(schema.passwordResetTokens).values({ userId, tokenHash, expiresAt });
  }

  async findValidPasswordResetToken(tokenHash: string) {
    const [row] = await this.db
      .select()
      .from(schema.passwordResetTokens)
      .where(
        and(
          eq(schema.passwordResetTokens.tokenHash, tokenHash),
          isNull(schema.passwordResetTokens.usedAt),
          gt(schema.passwordResetTokens.expiresAt, new Date())
        )
      )
      .limit(1);
    return row ?? null;
  }

  async consumePasswordResetToken(tokenId: string) {
    await this.db.update(schema.passwordResetTokens).set({ usedAt: new Date() }).where(eq(schema.passwordResetTokens.id, tokenId));
  }

  async createEmailVerificationToken(userId: string, tokenHash: string, expiresAt: Date) {
    await this.db.insert(schema.emailVerificationTokens).values({ userId, tokenHash, expiresAt });
  }

  async findValidEmailVerificationToken(tokenHash: string) {
    const [row] = await this.db
      .select()
      .from(schema.emailVerificationTokens)
      .where(
        and(
          eq(schema.emailVerificationTokens.tokenHash, tokenHash),
          isNull(schema.emailVerificationTokens.usedAt),
          gt(schema.emailVerificationTokens.expiresAt, new Date())
        )
      )
      .limit(1);
    return row ?? null;
  }

  async consumeEmailVerificationToken(tokenId: string) {
    await this.db.update(schema.emailVerificationTokens).set({ usedAt: new Date() }).where(eq(schema.emailVerificationTokens.id, tokenId));
  }

  /** Section 44 (admin: manage users). tenantId is null only for a super_admin's cross-tenant view. */
  async listAll(tenantId: string | null, page: number, pageSize: number, search?: string) {
    const offset = (page - 1) * pageSize;
    const tenantCondition = tenantId ? eq(schema.users.tenantId, tenantId) : undefined;
    const searchCondition = search
      ? or(ilike(schema.users.email, `%${search}%`), ilike(schema.users.firstName, `%${search}%`), ilike(schema.users.lastName, `%${search}%`))
      : undefined;
    const conditions = and(...[tenantCondition, searchCondition].filter((c): c is NonNullable<typeof c> => Boolean(c)));
    const [items, countRows] = await Promise.all([
      this.db
        .select({
          id: schema.users.id,
          tenantId: schema.users.tenantId,
          email: schema.users.email,
          firstName: schema.users.firstName,
          lastName: schema.users.lastName,
          status: schema.users.status,
          emailVerifiedAt: schema.users.emailVerifiedAt,
          createdAt: schema.users.createdAt,
        })
        .from(schema.users)
        .where(conditions)
        .orderBy(desc(schema.users.createdAt))
        .limit(pageSize)
        .offset(offset),
      this.db.select({ count: sql<number>`count(*)::int` }).from(schema.users).where(conditions),
    ]);
    return { items, total: countRows[0]?.count ?? 0 };
  }

  async setStatus(userId: string, tenantId: string, status: "active" | "suspended" | "deactivated") {
    const result = await this.db
      .update(schema.users)
      .set({ status, updatedAt: new Date() })
      .where(and(eq(schema.users.id, userId), eq(schema.users.tenantId, tenantId)))
      .returning({ id: schema.users.id });
    return result.length > 0;
  }

  async getRoleNames(userId: string) {
    const rows = await this.db
      .select({ name: schema.roles.name })
      .from(schema.userRoles)
      .innerJoin(schema.roles, eq(schema.roles.id, schema.userRoles.roleId))
      .where(eq(schema.userRoles.userId, userId));
    return rows.map((r) => r.name);
  }

  async setRole(userId: string, tenantId: string, roleName: string) {
    const [role] = await this.db.select().from(schema.roles).where(eq(schema.roles.name, roleName)).limit(1);
    if (!role) return false;
    // Confirm the target user actually belongs to the calling admin's tenant
    // before touching their roles - a shared `roles` table (see identity.ts)
    // means the roleId lookup above has no tenant boundary of its own.
    const target = await this.findByIdForTenant(userId, tenantId);
    if (!target) return false;
    await this.db.transaction(async (tx) => {
      await tx.delete(schema.userRoles).where(eq(schema.userRoles.userId, userId));
      await tx.insert(schema.userRoles).values({ userId, roleId: role.id });
    });
    return true;
  }
}
