import { boolean, date, index, integer, numeric, pgTable, text, time, uuid, varchar } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { idColumn, tenantIdColumn, timestampColumns } from "./_helpers.js";
import { cities } from "./geography.js";
import { tenants } from "./tenants.js";

/**
 * Named pickup/dropoff points - airports, hotels, or arbitrary addresses.
 * Unlike accommodation/transport, transfers were never modeled as
 * operator-owned, so tenantId is the only isolation boundary here.
 */
export const transferLocations = pgTable(
  "transfer_locations",
  {
    id: idColumn(),
    tenantId: tenantIdColumn().references(() => tenants.id, { onDelete: "restrict" }),
    cityId: uuid("city_id")
      .notNull()
      .references(() => cities.id, { onDelete: "restrict" }),
    name: varchar("name", { length: 200 }).notNull(), // e.g. "Jomo Kenyatta International Airport (JKIA)"
    type: varchar("type", { length: 20 }).notNull().default("airport"), // airport|hotel|address
    address: text("address"),
    ...timestampColumns,
  },
  (table) => ({
    tenantIdx: index("transfer_locations_tenant_idx").on(table.tenantId),
    cityIdx: index("transfer_locations_city_idx").on(table.cityId),
  })
);

export const airportTransfers = pgTable(
  "airport_transfers",
  {
    id: idColumn(),
    tenantId: tenantIdColumn().references(() => tenants.id, { onDelete: "restrict" }),
    pickupLocationId: uuid("pickup_location_id")
      .notNull()
      .references(() => transferLocations.id, { onDelete: "restrict" }),
    dropoffLocationId: uuid("dropoff_location_id")
      .notNull()
      .references(() => transferLocations.id, { onDelete: "restrict" }),
    transferType: varchar("transfer_type", { length: 20 }).notNull().default("private"), // private|shared
    direction: varchar("direction", { length: 10 }).notNull().default("one_way"), // one_way|return
    basePrice: numeric("base_price", { precision: 12, scale: 2 }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("USD"),
    meetAndGreet: boolean("meet_and_greet").notNull().default(false),
    ...timestampColumns,
  },
  (table) => ({
    tenantIdx: index("airport_transfers_tenant_idx").on(table.tenantId),
    routeIdx: index("airport_transfers_route_idx").on(table.pickupLocationId, table.dropoffLocationId),
  })
);

export const transferBookings = pgTable(
  "transfer_bookings",
  {
    id: idColumn(),
    bookingId: uuid("booking_id"), // linked via bookings schema relation
    airportTransferId: uuid("airport_transfer_id")
      .notNull()
      .references(() => airportTransfers.id, { onDelete: "restrict" }),
    transferDate: date("transfer_date").notNull(),
    transferTime: time("transfer_time"),
    passengerCount: integer("passenger_count").notNull().default(1),
    luggageCount: integer("luggage_count").default(0),
    childSeatsRequired: integer("child_seats_required").default(0),
    flightNumber: varchar("flight_number", { length: 20 }),
    driverAssignedUserId: uuid("driver_assigned_user_id"),
    driverContact: varchar("driver_contact", { length: 32 }),
    vehicleDetails: text("vehicle_details"),
    price: numeric("price", { precision: 12, scale: 2 }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("held"),
    ...timestampColumns,
  },
  (table) => ({
    bookingIdx: index("transfer_bookings_booking_idx").on(table.bookingId),
  })
);

export const transferLocationsRelations = relations(transferLocations, ({ one }) => ({
  tenant: one(tenants, { fields: [transferLocations.tenantId], references: [tenants.id] }),
  city: one(cities, { fields: [transferLocations.cityId], references: [cities.id] }),
}));

export const airportTransfersRelations = relations(airportTransfers, ({ one }) => ({
  tenant: one(tenants, { fields: [airportTransfers.tenantId], references: [tenants.id] }),
  pickupLocation: one(transferLocations, {
    fields: [airportTransfers.pickupLocationId],
    references: [transferLocations.id],
  }),
  dropoffLocation: one(transferLocations, {
    fields: [airportTransfers.dropoffLocationId],
    references: [transferLocations.id],
  }),
}));
