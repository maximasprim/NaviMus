import { index, integer, numeric, pgTable, uuid, varchar } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { idColumn, tenantIdColumn, timestampColumns } from "./_helpers.js";
import { operators } from "./operators.js";
import { tenants } from "./tenants.js";

export const cancellationPolicies = pgTable(
  "cancellation_policies",
  {
    id: idColumn(),
    tenantId: tenantIdColumn().references(() => tenants.id, { onDelete: "restrict" }),
    operatorId: uuid("operator_id")
      .notNull()
      .references(() => operators.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 150 }).notNull(),
    ...timestampColumns,
  },
  (table) => ({
    tenantIdx: index("cancellation_policies_tenant_idx").on(table.tenantId),
    operatorIdx: index("cancellation_policies_operator_idx").on(table.operatorId),
  })
);

/**
 * A rule is a band of "days before trip start". The Booking
 * service picks the single rule whose [daysBeforeMin, daysBeforeMax]
 * range contains the actual days-before-trip at cancellation time.
 * Configured per operator/policy - never hardcoded percentages.
 */
export const cancellationRules = pgTable(
  "cancellation_rules",
  {
    id: idColumn(),
    policyId: uuid("policy_id")
      .notNull()
      .references(() => cancellationPolicies.id, { onDelete: "cascade" }),
    daysBeforeMin: integer("days_before_min").notNull(), // inclusive
    daysBeforeMax: integer("days_before_max"), // inclusive, null = unbounded (e.g. "30+ days")
    refundPercentage: numeric("refund_percentage", { precision: 5, scale: 2 }).notNull(),
    penaltyPercentage: numeric("penalty_percentage", { precision: 5, scale: 2 }).notNull().default("0.00"),
    ...timestampColumns,
  },
  (table) => ({
    policyIdx: index("cancellation_rules_policy_idx").on(table.policyId),
  })
);

export const cancellationPoliciesRelations = relations(cancellationPolicies, ({ one, many }) => ({
  tenant: one(tenants, { fields: [cancellationPolicies.tenantId], references: [tenants.id] }),
  operator: one(operators, { fields: [cancellationPolicies.operatorId], references: [operators.id] }),
  rules: many(cancellationRules),
}));

export const cancellationRulesRelations = relations(cancellationRules, ({ one }) => ({
  policy: one(cancellationPolicies, { fields: [cancellationRules.policyId], references: [cancellationPolicies.id] }),
}));
