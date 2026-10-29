import { date, index, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { idColumn, tenantIdColumn, timestampColumns } from "./_helpers.js";
import { users } from "./identity.js";
import { travelers } from "./travelers.js";
import { packages } from "./packages.js";
import { cancellationRules } from "./cancellation.js";
import { tenants } from "./tenants.js";

/**
 * The central booking record. `status` is only ever changed via
 * the Booking service's state-machine transition function, which
 * validates against BOOKING_STATUS_TRANSITIONS and writes a
 * matching booking_status_history row in the same transaction.
 */
export const bookings = pgTable(
  "bookings",
  {
    id: idColumn(),
    tenantId: tenantIdColumn().references(() => tenants.id, { onDelete: "restrict" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    packageId: uuid("package_id").references(() => packages.id, { onDelete: "restrict" }),
    // See BOOKING_STATUSES in @travel/types - this column is the enforced source of truth.
    status: varchar("status", { length: 30 }).notNull().default("DRAFT"),
    travelDate: date("travel_date").notNull(),
    travelerCount: integer("traveler_count").notNull().default(1),
    // Server-computed totals only. Never trust a client-supplied amount here.
    subtotalAmount: numeric("subtotal_amount", { precision: 12, scale: 2 }).notNull().default("0.00"),
    discountAmount: numeric("discount_amount", { precision: 12, scale: 2 }).notNull().default("0.00"),
    taxAmount: numeric("tax_amount", { precision: 12, scale: 2 }).notNull().default("0.00"),
    totalAmount: numeric("total_amount", { precision: 12, scale: 2 }).notNull().default("0.00"),
    amountPaid: numeric("amount_paid", { precision: 12, scale: 2 }).notNull().default("0.00"),
    currency: varchar("currency", { length: 3 }).notNull(),
    couponCode: varchar("coupon_code", { length: 50 }),
    contactEmail: varchar("contact_email", { length: 255 }).notNull(),
    contactPhone: varchar("contact_phone", { length: 32 }).notNull(),
    specialRequests: text("special_requests"),
    cancellationPolicyId: uuid("cancellation_policy_id"),
    // Guarantees POST /bookings is safe to retry from flaky mobile networks.
    idempotencyKey: varchar("idempotency_key", { length: 128 }).notNull(),
    holdExpiresAt: timestamp("hold_expires_at", { withTimezone: true }),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    ...timestampColumns,
  },
  (table) => ({
    // Idempotency keys are client-generated (mobile retry safety) - scoping
    // by tenant means two different businesses' clients can never collide,
    // and it matches every other uniqueness fix in this migration.
    tenantIdempotencyUnique: uniqueIndex("bookings_tenant_idempotency_unique").on(
      table.tenantId,
      table.idempotencyKey
    ),
    tenantIdx: index("bookings_tenant_idx").on(table.tenantId),
    userIdx: index("bookings_user_idx").on(table.userId),
    statusIdx: index("bookings_status_idx").on(table.status),
    travelDateIdx: index("bookings_travel_date_idx").on(table.travelDate),
    // Speeds up the stale-hold reaper job described in the booking architecture.
    pendingStatusIdx: index("bookings_pending_status_idx").on(table.status, table.holdExpiresAt),
  })
);

/** Line items composing a booking: transport, accommodation, transfer, activity add-ons. */
export const bookingItems = pgTable(
  "booking_items",
  {
    id: idColumn(),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    itemType: varchar("item_type", { length: 20 }).notNull(), // transport|accommodation|transfer|activity
    referenceId: uuid("reference_id").notNull(), // points at transport_bookings/accommodation_bookings/etc
    description: varchar("description", { length: 300 }),
    quantity: integer("quantity").notNull().default(1),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),
    ...timestampColumns,
  },
  (table) => ({
    bookingIdx: index("booking_items_booking_idx").on(table.bookingId),
  })
);

/** Links a booking to the traveler profiles included in it. */
export const bookingTravelers = pgTable(
  "booking_travelers",
  {
    id: idColumn(),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    travelerId: uuid("traveler_id")
      .notNull()
      .references(() => travelers.id, { onDelete: "restrict" }),
    travelerType: varchar("traveler_type", { length: 10 }).notNull(), // adult|child|infant
    priceAmount: numeric("price_amount", { precision: 12, scale: 2 }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),
    ...timestampColumns,
  },
  (table) => ({
    bookingIdx: index("booking_travelers_booking_idx").on(table.bookingId),
    travelerIdx: index("booking_travelers_traveler_idx").on(table.travelerId),
  })
);

/** Append-only audit trail of every status change. Never update in place. */
export const bookingStatusHistory = pgTable(
  "booking_status_history",
  {
    id: idColumn(),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    fromStatus: varchar("from_status", { length: 30 }),
    toStatus: varchar("to_status", { length: 30 }).notNull(),
    changedByUserId: uuid("changed_by_user_id").references(() => users.id),
    reason: text("reason"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    bookingIdx: index("booking_status_history_booking_idx").on(table.bookingId),
  })
);

export const bookingCancellations = pgTable(
  "booking_cancellations",
  {
    id: idColumn(),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    ruleAppliedId: uuid("rule_applied_id").references(() => cancellationRules.id),
    daysBeforeTrip: integer("days_before_trip").notNull(),
    refundAmount: numeric("refund_amount", { precision: 12, scale: 2 }).notNull(),
    penaltyAmount: numeric("penalty_amount", { precision: 12, scale: 2 }).notNull().default("0.00"),
    currency: varchar("currency", { length: 3 }).notNull(),
    requestedByUserId: uuid("requested_by_user_id").references(() => users.id),
    reason: text("reason"),
    ...timestampColumns,
  },
  (table) => ({
    bookingIdx: index("booking_cancellations_booking_idx").on(table.bookingId),
  })
);

export const bookingsRelations = relations(bookings, ({ one, many }) => ({
  tenant: one(tenants, { fields: [bookings.tenantId], references: [tenants.id] }),
  user: one(users, { fields: [bookings.userId], references: [users.id] }),
  package: one(packages, { fields: [bookings.packageId], references: [packages.id] }),
  items: many(bookingItems),
  travelers: many(bookingTravelers),
  statusHistory: many(bookingStatusHistory),
  cancellations: many(bookingCancellations),
}));

export const bookingItemsRelations = relations(bookingItems, ({ one }) => ({
  booking: one(bookings, { fields: [bookingItems.bookingId], references: [bookings.id] }),
}));

export const bookingTravelersRelations = relations(bookingTravelers, ({ one }) => ({
  booking: one(bookings, { fields: [bookingTravelers.bookingId], references: [bookings.id] }),
  traveler: one(travelers, { fields: [bookingTravelers.travelerId], references: [travelers.id] }),
}));
