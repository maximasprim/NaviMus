import { date, index, pgTable, text, uuid, varchar } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { idColumn, softDeleteColumn, tenantIdColumn, timestampColumns } from "./_helpers.js";
import { users } from "./identity.js";
import { tenants } from "./tenants.js";

/**
 * A traveler profile is a saved passenger a customer can reuse
 * across bookings. It is intentionally separate from `users` -
 * a traveler need not have a login (e.g. a child, or a colleague
 * on a corporate booking).
 */
export const travelers = pgTable(
  "travelers",
  {
    id: idColumn(),
    // Passport data lives here, so this table gets its own tenant_id even
    // though owner_user_id already implies one: it lets the app filter by
    // tenant directly (withTenant) and gives row-level security a simple,
    // fast, self-contained policy instead of a join through users.
    tenantId: tenantIdColumn().references(() => tenants.id, { onDelete: "restrict" }),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    firstName: varchar("first_name", { length: 100 }).notNull(),
    lastName: varchar("last_name", { length: 100 }).notNull(),
    dateOfBirth: date("date_of_birth"),
    gender: varchar("gender", { length: 20 }),
    nationality: varchar("nationality", { length: 2 }),
    // Passport data is sensitive: encrypted at the application layer before
    // being written here, and only collected when a specific trip requires it.
    passportNumberEncrypted: text("passport_number_encrypted"),
    passportExpiryDate: date("passport_expiry_date"),
    phone: varchar("phone", { length: 32 }),
    email: varchar("email", { length: 255 }),
    emergencyContactName: varchar("emergency_contact_name", { length: 200 }),
    emergencyContactPhone: varchar("emergency_contact_phone", { length: 32 }),
    dietaryRequirements: text("dietary_requirements"),
    accessibilityRequirements: text("accessibility_requirements"),
    ...timestampColumns,
    ...softDeleteColumn,
  },
  (table) => ({
    ownerIdx: index("travelers_owner_idx").on(table.ownerUserId),
    tenantIdx: index("travelers_tenant_idx").on(table.tenantId),
  })
);

export const travelersRelations = relations(travelers, ({ one }) => ({
  owner: one(users, { fields: [travelers.ownerUserId], references: [users.id] }),
}));
