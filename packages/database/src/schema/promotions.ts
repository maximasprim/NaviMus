import { boolean, date, index, integer, numeric, pgTable, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { idColumn, tenantIdColumn, timestampColumns } from "./_helpers.js";
import { operators } from "./operators.js";
import { tenants } from "./tenants.js";

export const coupons = pgTable(
  "coupons",
  {
    id: idColumn(),
    tenantId: tenantIdColumn().references(() => tenants.id, { onDelete: "restrict" }),
    code: varchar("code", { length: 50 }).notNull(),
    operatorId: uuid("operator_id").references(() => operators.id, { onDelete: "cascade" }), // null = tenant-wide
    discountType: varchar("discount_type", { length: 20 }).notNull(), // percentage|fixed_amount
    discountValue: numeric("discount_value", { precision: 12, scale: 2 }).notNull(),
    currency: varchar("currency", { length: 3 }), // required when discountType = fixed_amount
    maxUses: integer("max_uses"),
    usedCount: integer("used_count").notNull().default(0),
    minBookingAmount: numeric("min_booking_amount", { precision: 12, scale: 2 }),
    validFrom: date("valid_from"),
    validUntil: date("valid_until"),
    isActive: boolean("is_active").notNull().default(true),
    ...timestampColumns,
  },
  (table) => ({
    // Was globally unique - two tenants must be able to both run a "SAVE10" code.
    tenantCodeUnique: uniqueIndex("coupons_tenant_code_unique").on(table.tenantId, table.code),
    tenantIdx: index("coupons_tenant_idx").on(table.tenantId),
  })
);

/**
 * Broader promotional campaigns (seasonal, early-booking, group,
 * last-minute, flash sale, loyalty, partner). A coupon can
 * optionally belong to a promotion for reporting/grouping; the
 * promotion itself may also apply automatically without a code.
 */
export const promotions = pgTable(
  "promotions",
  {
    id: idColumn(),
    tenantId: tenantIdColumn().references(() => tenants.id, { onDelete: "restrict" }),
    name: varchar("name", { length: 200 }).notNull(),
    // seasonal|early_booking|group|last_minute|flash_sale|loyalty|partner
    type: varchar("type", { length: 30 }).notNull(),
    description: varchar("description", { length: 500 }),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    isActive: boolean("is_active").notNull().default(true),
    ...timestampColumns,
  },
  (table) => ({
    tenantIdx: index("promotions_tenant_idx").on(table.tenantId),
    typeIdx: index("promotions_type_idx").on(table.type),
    activeIdx: index("promotions_active_idx").on(table.isActive),
  })
);

export const discounts = pgTable(
  "discounts",
  {
    id: idColumn(),
    promotionId: uuid("promotion_id")
      .notNull()
      .references(() => promotions.id, { onDelete: "cascade" }),
    // Rule config kept generic (min group size, min days before travel, etc.)
    // rather than one column per rule type, since promotion rules vary widely.
    conditionKey: varchar("condition_key", { length: 50 }).notNull(),
    conditionValue: varchar("condition_value", { length: 100 }).notNull(),
    discountType: varchar("discount_type", { length: 20 }).notNull(), // percentage|fixed_amount
    discountValue: numeric("discount_value", { precision: 12, scale: 2 }).notNull(),
    ...timestampColumns,
  },
  (table) => ({
    promotionIdx: index("discounts_promotion_idx").on(table.promotionId),
  })
);

export const promotionsRelations = relations(promotions, ({ one, many }) => ({
  tenant: one(tenants, { fields: [promotions.tenantId], references: [tenants.id] }),
  discounts: many(discounts),
}));

export const discountsRelations = relations(discounts, ({ one }) => ({
  promotion: one(promotions, { fields: [discounts.promotionId], references: [promotions.id] }),
}));
