import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { idColumn, tenantIdColumn, timestampColumns } from "./_helpers.js";
import { users } from "./identity.js";
import { bookings } from "./bookings.js";
import { tenants } from "./tenants.js";

/**
 * Append-only. Every sensitive/administrative action writes one row here.
 *
 * tenantId is nullable here - the one deliberate exception to the rest of
 * this migration. A super_admin action like "suspended tenant X" or
 * "created tenant Y" isn't itself an action *of* a tenant, so forcing a
 * tenant_id here would mean either picking an arbitrary tenant to blame it
 * on, or attributing platform-level actions to the default tenant, both of
 * which would make the audit trail actively misleading. Tenant-scoped
 * actions (e.g. "operator.approved" performed by that tenant's admin) do
 * still set tenantId, so per-tenant audit views (Phase 4) work normally.
 */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: idColumn(),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "restrict" }),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    action: varchar("action", { length: 100 }).notNull(), // e.g. booking.cancelled, operator.approved
    resourceType: varchar("resource_type", { length: 50 }).notNull(),
    resourceId: uuid("resource_id"),
    ipAddress: varchar("ip_address", { length: 45 }),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index("audit_logs_tenant_idx").on(table.tenantId),
    actorIdx: index("audit_logs_actor_idx").on(table.actorUserId),
    resourceIdx: index("audit_logs_resource_idx").on(table.resourceType, table.resourceId),
  })
);

/**
 * Settings with tenantId = null are platform-wide defaults (set by you,
 * the super admin); a row with a tenantId is that one tenant's override of
 * the same key. Two partial unique indexes (rather than one composite
 * unique on a nullable column) because Postgres treats every NULL as
 * distinct in a unique index - without this split, nothing would stop two
 * separate platform-wide rows for the same key from both being inserted.
 * The app-layer settings lookup (Phase 3) reads the tenant override first
 * and falls back to the platform default when no override row exists.
 */
export const systemSettings = pgTable(
  "system_settings",
  {
    id: idColumn(),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "restrict" }),
    key: varchar("key", { length: 100 }).notNull(),
    value: jsonb("value").notNull(),
    description: text("description"),
    ...timestampColumns,
  },
  (table) => ({
    platformKeyUnique: uniqueIndex("system_settings_platform_key_unique")
      .on(table.key)
      .where(sql`${table.tenantId} IS NULL`),
    tenantKeyUnique: uniqueIndex("system_settings_tenant_key_unique")
      .on(table.tenantId, table.key)
      .where(sql`${table.tenantId} IS NOT NULL`),
    tenantIdx: index("system_settings_tenant_idx").on(table.tenantId),
  })
);

export const favorites = pgTable(
  "favorites",
  {
    id: idColumn(),
    tenantId: tenantIdColumn().references(() => tenants.id, { onDelete: "restrict" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    subjectType: varchar("subject_type", { length: 30 }).notNull(), // destination|package|accommodation
    subjectId: uuid("subject_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userSubjectUnique: uniqueIndex("favorites_user_subject_unique").on(
      table.userId,
      table.subjectType,
      table.subjectId
    ),
  })
);

export const searchLogs = pgTable(
  "search_logs",
  {
    id: idColumn(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    query: text("query"),
    filters: jsonb("filters"),
    resultCount: varchar("result_count", { length: 10 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdx: index("search_logs_user_idx").on(table.userId),
    createdAtIdx: index("search_logs_created_at_idx").on(table.createdAt),
  })
);

export const supportTickets = pgTable(
  "support_tickets",
  {
    id: idColumn(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    bookingId: uuid("booking_id").references(() => bookings.id, { onDelete: "set null" }),
    subject: varchar("subject", { length: 300 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("open"), // open|in_progress|resolved|closed
    priority: varchar("priority", { length: 10 }).notNull().default("normal"), // low|normal|high|urgent
    assignedToUserId: uuid("assigned_to_user_id").references(() => users.id),
    ...timestampColumns,
  },
  (table) => ({
    userIdx: index("support_tickets_user_idx").on(table.userId),
    statusIdx: index("support_tickets_status_idx").on(table.status),
  })
);

export const supportMessages = pgTable(
  "support_messages",
  {
    id: idColumn(),
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => supportTickets.id, { onDelete: "cascade" }),
    senderUserId: uuid("sender_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    ticketIdx: index("support_messages_ticket_idx").on(table.ticketId),
  })
);

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  tenant: one(tenants, { fields: [auditLogs.tenantId], references: [tenants.id] }),
  actor: one(users, { fields: [auditLogs.actorUserId], references: [users.id] }),
}));

export const supportTicketsRelations = relations(supportTickets, ({ one, many }) => ({
  user: one(users, { fields: [supportTickets.userId], references: [users.id] }),
  booking: one(bookings, { fields: [supportTickets.bookingId], references: [bookings.id] }),
  messages: many(supportMessages),
}));

export const supportMessagesRelations = relations(supportMessages, ({ one }) => ({
  ticket: one(supportTickets, { fields: [supportMessages.ticketId], references: [supportTickets.id] }),
  sender: one(users, { fields: [supportMessages.senderUserId], references: [users.id] }),
}));
