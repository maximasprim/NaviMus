import { boolean, index, integer, jsonb, numeric, pgTable, text, uniqueIndex, uuid, varchar, date } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { idColumn, softDeleteColumn, tenantIdColumn, timestampColumns } from "./_helpers.js";
import { cities } from "./geography.js";
import { operators } from "./operators.js";
import { tenants } from "./tenants.js";

export const accommodations = pgTable(
  "accommodations",
  {
    id: idColumn(),
    tenantId: tenantIdColumn().references(() => tenants.id, { onDelete: "restrict" }),
    operatorId: uuid("operator_id")
      .notNull()
      .references(() => operators.id, { onDelete: "restrict" }),
    cityId: uuid("city_id")
      .notNull()
      .references(() => cities.id, { onDelete: "restrict" }),
    name: varchar("name", { length: 200 }).notNull(),
    slug: varchar("slug", { length: 220 }).notNull(),
    // hotel|lodge|resort|villa|apartment|cottage|camp|guest_house|eco_lodge|glamping
    type: varchar("type", { length: 30 }).notNull(),
    description: text("description"),
    starRating: integer("star_rating"), // 1-5, optional
    amenities: jsonb("amenities"), // string[]
    checkInTime: varchar("check_in_time", { length: 5 }), // "14:00"
    checkOutTime: varchar("check_out_time", { length: 5 }),
    cancellationPolicyId: uuid("cancellation_policy_id"),
    status: varchar("status", { length: 20 }).notNull().default("draft"),
    ...timestampColumns,
    ...softDeleteColumn,
  },
  (table) => ({
    tenantCitySlugUnique: uniqueIndex("accommodations_tenant_city_slug_unique").on(
      table.tenantId,
      table.cityId,
      table.slug
    ),
    tenantIdx: index("accommodations_tenant_idx").on(table.tenantId),
    operatorIdx: index("accommodations_operator_idx").on(table.operatorId),
  })
);

export const roomTypes = pgTable(
  "room_types",
  {
    id: idColumn(),
    accommodationId: uuid("accommodation_id")
      .notNull()
      .references(() => accommodations.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 150 }).notNull(),
    maxOccupancy: integer("max_occupancy").notNull().default(2),
    basePricePerNight: numeric("base_price_per_night", { precision: 12, scale: 2 }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("USD"),
    mealPlan: varchar("meal_plan", { length: 30 }), // room_only|breakfast|half_board|full_board|all_inclusive
    ...timestampColumns,
    ...softDeleteColumn,
  },
  (table) => ({
    accommodationIdx: index("room_types_accommodation_idx").on(table.accommodationId),
  })
);

/** Physical/bookable rooms of a given type, tracked for per-night availability. */
export const rooms = pgTable(
  "rooms",
  {
    id: idColumn(),
    roomTypeId: uuid("room_type_id")
      .notNull()
      .references(() => roomTypes.id, { onDelete: "cascade" }),
    roomNumber: varchar("room_number", { length: 20 }),
    isActive: boolean("is_active").notNull().default(true),
    ...timestampColumns,
  },
  (table) => ({
    roomTypeIdx: index("rooms_room_type_idx").on(table.roomTypeId),
  })
);

/** One row per room type per date - the source of truth for accommodation availability. */
export const accommodationBookings = pgTable(
  "accommodation_bookings",
  {
    id: idColumn(),
    roomTypeId: uuid("room_type_id")
      .notNull()
      .references(() => roomTypes.id, { onDelete: "restrict" }),
    bookingId: uuid("booking_id"), // FK to bookings, added via relation in bookings schema to avoid circular import
    checkInDate: date("check_in_date").notNull(),
    checkOutDate: date("check_out_date").notNull(),
    roomsBooked: integer("rooms_booked").notNull().default(1),
    pricePerNight: numeric("price_per_night", { precision: 12, scale: 2 }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("held"), // held|confirmed|cancelled
    ...timestampColumns,
  },
  (table) => ({
    roomTypeDateIdx: index("accommodation_bookings_room_type_date_idx").on(
      table.roomTypeId,
      table.checkInDate,
      table.checkOutDate
    ),
    bookingIdx: index("accommodation_bookings_booking_idx").on(table.bookingId),
  })
);

export const accommodationsRelations = relations(accommodations, ({ one, many }) => ({
  tenant: one(tenants, { fields: [accommodations.tenantId], references: [tenants.id] }),
  operator: one(operators, { fields: [accommodations.operatorId], references: [operators.id] }),
  city: one(cities, { fields: [accommodations.cityId], references: [cities.id] }),
  roomTypes: many(roomTypes),
}));

export const roomTypesRelations = relations(roomTypes, ({ one, many }) => ({
  accommodation: one(accommodations, { fields: [roomTypes.accommodationId], references: [accommodations.id] }),
  rooms: many(rooms),
}));
