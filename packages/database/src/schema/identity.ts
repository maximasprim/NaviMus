import { boolean, index, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { idColumn, softDeleteColumn, tenantIdColumn, timestampColumns } from "./_helpers.js";
import { tenants } from "./tenants.js";

export const users = pgTable(
  "users",
  {
    id: idColumn(),
    tenantId: tenantIdColumn().references(() => tenants.id, { onDelete: "restrict" }),
    email: varchar("email", { length: 255 }).notNull(),
    phone: varchar("phone", { length: 32 }),
    passwordHash: text("password_hash").notNull(),
    firstName: varchar("first_name", { length: 100 }).notNull(),
    lastName: varchar("last_name", { length: 100 }).notNull(),
    nationality: varchar("nationality", { length: 2 }), // ISO 3166-1 alpha-2
    status: varchar("status", { length: 20 }).notNull().default("active"), // active|suspended|deactivated
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    mfaEnabled: boolean("mfa_enabled").notNull().default(false),
    mfaSecret: text("mfa_secret"), // encrypted at rest by app layer
    ...timestampColumns,
    ...softDeleteColumn,
  },
  (table) => ({
    // Was globally unique pre-multitenancy. Now scoped per tenant so two
    // different businesses can each have a customer with the same email -
    // required for the "fully isolated customers per tenant" model. The
    // auth service's login-by-email lookup (Phase 2) has to take a
    // resolved tenantId alongside the email for this reason.
    tenantEmailUnique: uniqueIndex("users_tenant_email_unique").on(table.tenantId, table.email),
    tenantIdx: index("users_tenant_idx").on(table.tenantId),
    phoneIdx: index("users_phone_idx").on(table.phone),
  })
);

/**
 * Global, shared across all tenants - role/permission *definitions* are
 * platform concepts ("customer", "operator_admin", "super_admin"), not
 * something each tenant redefines. What's tenant-scoped is which *user*
 * holds a role (via user_roles, and users.tenantId), not the role itself.
 *
 * `super_admin` is the one role that means "not scoped to my own tenant" -
 * the Phase 2 auth/RBAC middleware treats it as a bypass of tenant
 * filtering rather than a role tied to tenant-owned resources, which is
 * how the platform admin manages every tenant from one login.
 */
export const roles = pgTable(
  "roles",
  {
    id: idColumn(),
    name: varchar("name", { length: 50 }).notNull(), // e.g. super_admin, customer
    description: text("description"),
    ...timestampColumns,
  },
  (table) => ({
    nameUnique: uniqueIndex("roles_name_unique").on(table.name),
  })
);

export const permissions = pgTable(
  "permissions",
  {
    id: idColumn(),
    code: varchar("code", { length: 100 }).notNull(), // e.g. booking:cancel
    description: text("description"),
    ...timestampColumns,
  },
  (table) => ({
    codeUnique: uniqueIndex("permissions_code_unique").on(table.code),
  })
);

export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    permissionId: uuid("permission_id")
      .notNull()
      .references(() => permissions.id, { onDelete: "cascade" }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.roleId, table.permissionId] }),
  })
);

export const userRoles = pgTable(
  "user_roles",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.roleId] }),
  })
);

export const usersRelations = relations(users, ({ one, many }) => ({
  tenant: one(tenants, { fields: [users.tenantId], references: [tenants.id] }),
  userRoles: many(userRoles),
}));

export const rolesRelations = relations(roles, ({ many }) => ({
  rolePermissions: many(rolePermissions),
  userRoles: many(userRoles),
}));

export const permissionsRelations = relations(permissions, ({ many }) => ({
  rolePermissions: many(rolePermissions),
}));

export const rolePermissionsRelations = relations(rolePermissions, ({ one }) => ({
  role: one(roles, { fields: [rolePermissions.roleId], references: [roles.id] }),
  permission: one(permissions, { fields: [rolePermissions.permissionId], references: [permissions.id] }),
}));

export const userRolesRelations = relations(userRoles, ({ one }) => ({
  user: one(users, { fields: [userRoles.userId], references: [users.id] }),
  role: one(roles, { fields: [userRoles.roleId], references: [roles.id] }),
}));

/**
 * Section 21 (emails: password reset, email verification) needs a
 * single-use, revocable, expiring token - a signed JWT can't be
 * revoked or single-use without extra state anyway, so this stores the
 * token server-side instead of reusing the stateless JWT approach used
 * for access/refresh tokens. Only the SHA-256 hash of the token is
 * stored (never the raw token - same principle as `passwordHash`), so a
 * database read alone can never produce a usable reset/verification
 * link.
 */
export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: idColumn(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(), // sha256 hex digest
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tokenHashUnique: uniqueIndex("password_reset_tokens_hash_unique").on(table.tokenHash),
    userIdx: index("password_reset_tokens_user_idx").on(table.userId),
  })
);

/**
 * One row per refresh token ever issued (id = the JWT's jti). This is what
 * makes sessions revocable: refresh tokens used to be stateless JWTs, so
 * "logout" could not end anything and a stolen token stayed good for 30 days.
 * Rotation: every refresh revokes the presented token and issues a new one in
 * the same `family`. Presenting an already-revoked token is reuse (a copy
 * was stolen, or replayed) and revokes the whole family.
 */
export const refreshTokens = pgTable(
  "refresh_tokens",
  {
    id: uuid("id").primaryKey(), // = jti; generated by the app so it can be put in the JWT before insert
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    family: uuid("family").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdx: index("refresh_tokens_user_idx").on(table.userId),
    familyIdx: index("refresh_tokens_family_idx").on(table.family),
    expiresIdx: index("refresh_tokens_expires_idx").on(table.expiresAt),
  })
);

export const emailVerificationTokens = pgTable(
  "email_verification_tokens",
  {
    id: idColumn(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tokenHashUnique: uniqueIndex("email_verification_tokens_hash_unique").on(table.tokenHash),
    userIdx: index("email_verification_tokens_user_idx").on(table.userId),
  })
);

export const passwordResetTokensRelations = relations(passwordResetTokens, ({ one }) => ({
  user: one(users, { fields: [passwordResetTokens.userId], references: [users.id] }),
}));

export const emailVerificationTokensRelations = relations(emailVerificationTokens, ({ one }) => ({
  user: one(users, { fields: [emailVerificationTokens.userId], references: [users.id] }),
}));
