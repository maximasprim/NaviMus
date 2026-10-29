import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { idColumn, tenantIdColumn, timestampColumns } from "./_helpers.js";
import { users } from "./identity.js";
import { tenants } from "./tenants.js";

/**
 * Tenant-scoped so a business can customize its own notification copy
 * ("booking confirmed" wording, sender branding) independently of others.
 */
export const notificationTemplates = pgTable(
  "notification_templates",
  {
    id: idColumn(),
    tenantId: tenantIdColumn().references(() => tenants.id, { onDelete: "restrict" }),
    key: varchar("key", { length: 100 }).notNull(), // e.g. booking.confirmed, payment.failed
    channel: varchar("channel", { length: 20 }).notNull(), // email|sms|whatsapp|push|in_app
    locale: varchar("locale", { length: 10 }).notNull().default("en"),
    subject: varchar("subject", { length: 300 }), // email only
    bodyTemplate: text("body_template").notNull(), // supports {{variable}} interpolation
    ...timestampColumns,
  },
  (table) => ({
    tenantKeyChannelLocaleUnique: uniqueIndex("notification_templates_tenant_key_channel_locale_unique").on(
      table.tenantId,
      table.key,
      table.channel,
      table.locale
    ),
    tenantIdx: index("notification_templates_tenant_idx").on(table.tenantId),
  })
);

export const notificationLogs = pgTable(
  "notification_logs",
  {
    id: idColumn(),
    // Own tenant_id (not inherited via user_id): guest notifications - e.g. a
    // booking confirmation emailed to someone with no account - have no user,
    // so a parent-derived policy could never make those rows visible to the
    // tenant that sent them.
    tenantId: tenantIdColumn().references(() => tenants.id, { onDelete: "restrict" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    templateKey: varchar("template_key", { length: 100 }).notNull(),
    channel: varchar("channel", { length: 20 }).notNull(),
    recipient: varchar("recipient", { length: 255 }).notNull(), // email address or phone number
    status: varchar("status", { length: 20 }).notNull().default("queued"), // queued|sent|delivered|failed
    providerReference: varchar("provider_reference", { length: 200 }),
    errorMessage: text("error_message"),
    metadata: jsonb("metadata"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    // Only meaningful for channel="in_app" - the customer dashboard's
    // notification inbox uses this to distinguish read/unread. Other
    // channels (email/sms/whatsapp) never set this.
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdx: index("notification_logs_user_idx").on(table.userId),
    tenantIdx: index("notification_logs_tenant_idx").on(table.tenantId),
    statusIdx: index("notification_logs_status_idx").on(table.status),
  })
);

export const notificationTemplatesRelations = relations(notificationTemplates, ({ one }) => ({
  tenant: one(tenants, { fields: [notificationTemplates.tenantId], references: [tenants.id] }),
}));

export const notificationLogsRelations = relations(notificationLogs, ({ one }) => ({
  user: one(users, { fields: [notificationLogs.userId], references: [users.id] }),
}));
