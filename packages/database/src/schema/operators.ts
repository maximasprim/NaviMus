import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { idColumn, softDeleteColumn, tenantIdColumn, timestampColumns } from "./_helpers.js";
import { users } from "./identity.js";
import { tenants } from "./tenants.js";

export const operators = pgTable(
  "operators",
  {
    id: idColumn(),
    tenantId: tenantIdColumn().references(() => tenants.id, { onDelete: "restrict" }),
    businessName: varchar("business_name", { length: 200 }).notNull(),
    slug: varchar("slug", { length: 220 }).notNull(),
    // pending | approved | rejected | suspended - enforced in app layer against OPERATOR_STATUSES
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    contactEmail: varchar("contact_email", { length: 255 }).notNull(),
    contactPhone: varchar("contact_phone", { length: 32 }),
    countryId: uuid("country_id"),
    description: text("description"),
    commissionRatePercent: varchar("commission_rate_percent", { length: 10 }).default("10.00"),
    approvedByUserId: uuid("approved_by_user_id").references(() => users.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    ...timestampColumns,
    ...softDeleteColumn,
  },
  (table) => ({
    // Was globally unique; scoped per tenant so two tenants can each run
    // an operator with the same natural slug (e.g. both onboard a vendor
    // called "safari-adventures") without colliding.
    tenantSlugUnique: uniqueIndex("operators_tenant_slug_unique").on(table.tenantId, table.slug),
    tenantIdx: index("operators_tenant_idx").on(table.tenantId),
    statusIdx: index("operators_status_idx").on(table.status),
  })
);

/** Staff users belonging to an operator, each with a role within that operator's org. */
export const operatorUsers = pgTable(
  "operator_users",
  {
    id: idColumn(),
    operatorId: uuid("operator_id")
      .notNull()
      .references(() => operators.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 100 }),
    ...timestampColumns,
  },
  (table) => ({
    operatorUserUnique: uniqueIndex("operator_users_unique").on(table.operatorId, table.userId),
  })
);

export const operatorDocuments = pgTable(
  "operator_documents",
  {
    id: idColumn(),
    operatorId: uuid("operator_id")
      .notNull()
      .references(() => operators.id, { onDelete: "cascade" }),
    documentType: varchar("document_type", { length: 50 }).notNull(), // license, tax_cert, insurance...
    storageKey: text("storage_key").notNull(),
    status: varchar("status", { length: 20 }).notNull().default("pending"), // pending|approved|rejected
    reviewedByUserId: uuid("reviewed_by_user_id").references(() => users.id),
    ...timestampColumns,
  },
  (table) => ({
    operatorIdx: index("operator_documents_operator_idx").on(table.operatorId),
  })
);

/** Free-form catalogue of what an operator offers, used for admin review/search facets. */
export const operatorServices = pgTable(
  "operator_services",
  {
    id: idColumn(),
    operatorId: uuid("operator_id")
      .notNull()
      .references(() => operators.id, { onDelete: "cascade" }),
    serviceType: varchar("service_type", { length: 50 }).notNull(), // packages|transport|accommodation|transfers
    metadata: jsonb("metadata"),
    ...timestampColumns,
  },
  (table) => ({
    operatorIdx: index("operator_services_operator_idx").on(table.operatorId),
  })
);

export const operatorsRelations = relations(operators, ({ one, many }) => ({
  tenant: one(tenants, { fields: [operators.tenantId], references: [tenants.id] }),
  staff: many(operatorUsers),
  documents: many(operatorDocuments),
  services: many(operatorServices),
}));

export const operatorUsersRelations = relations(operatorUsers, ({ one }) => ({
  operator: one(operators, { fields: [operatorUsers.operatorId], references: [operators.id] }),
  user: one(users, { fields: [operatorUsers.userId], references: [users.id] }),
}));
