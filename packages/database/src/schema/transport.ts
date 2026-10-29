import { index, integer, numeric, pgTable, text, uuid, varchar } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { idColumn, softDeleteColumn, tenantIdColumn, timestampColumns } from "./_helpers.js";
import { operators } from "./operators.js";
import { cities } from "./geography.js";
import { tenants } from "./tenants.js";

export const transportProviders = pgTable(
  "transport_providers",
  {
    id: idColumn(),
    tenantId: tenantIdColumn().references(() => tenants.id, { onDelete: "restrict" }),
    operatorId: uuid("operator_id")
      .notNull()
      .references(() => operators.id, { onDelete: "restrict" }),
    name: varchar("name", { length: 200 }).notNull(),
    contactPhone: varchar("contact_phone", { length: 32 }),
    ...timestampColumns,
    ...softDeleteColumn,
  },
  (table) => ({
    tenantIdx: index("transport_providers_tenant_idx").on(table.tenantId),
    operatorIdx: index("transport_providers_operator_idx").on(table.operatorId),
  })
);

/**
 * Vehicle *types* ("van", "4x4 safari vehicle") are a per-tenant catalog,
 * not shared platform-wide reference data like geography - a tenant may
 * want to add its own type or rename one, so this gets tenantId directly
 * rather than being treated as global.
 */
export const vehicleTypes = pgTable(
  "vehicle_types",
  {
    id: idColumn(),
    tenantId: tenantIdColumn().references(() => tenants.id, { onDelete: "restrict" }),
    // private_car|suv|van|minibus|tour_bus|train|domestic_flight|international_flight|boat|ferry|motorbike|4x4_safari_vehicle|self_drive
    code: varchar("code", { length: 30 }).notNull(),
    name: varchar("name", { length: 100 }).notNull(),
    defaultCapacity: integer("default_capacity"),
    ...timestampColumns,
  },
  (table) => ({
    // Kept as a plain (non-unique) index, matching pre-multitenancy behavior -
    // upgrading this to a unique constraint wasn't asked for and could break
    // the migration if any current seed data already has duplicate codes.
    tenantCodeIdx: index("vehicle_types_tenant_code_idx").on(table.tenantId, table.code),
    tenantIdx: index("vehicle_types_tenant_idx").on(table.tenantId),
  })
);

export const vehicles = pgTable(
  "vehicles",
  {
    id: idColumn(),
    transportProviderId: uuid("transport_provider_id")
      .notNull()
      .references(() => transportProviders.id, { onDelete: "cascade" }),
    vehicleTypeId: uuid("vehicle_type_id")
      .notNull()
      .references(() => vehicleTypes.id, { onDelete: "restrict" }),
    name: varchar("name", { length: 150 }),
    registrationNumber: varchar("registration_number", { length: 30 }),
    capacity: integer("capacity").notNull(),
    ...timestampColumns,
    ...softDeleteColumn,
  },
  (table) => ({
    providerIdx: index("vehicles_provider_idx").on(table.transportProviderId),
  })
);

export const transportRoutes = pgTable(
  "transport_routes",
  {
    id: idColumn(),
    transportProviderId: uuid("transport_provider_id")
      .notNull()
      .references(() => transportProviders.id, { onDelete: "cascade" }),
    originCityId: uuid("origin_city_id")
      .notNull()
      .references(() => cities.id, { onDelete: "restrict" }),
    destinationCityId: uuid("destination_city_id")
      .notNull()
      .references(() => cities.id, { onDelete: "restrict" }),
    vehicleTypeId: uuid("vehicle_type_id")
      .notNull()
      .references(() => vehicleTypes.id, { onDelete: "restrict" }),
    basePrice: numeric("base_price", { precision: 12, scale: 2 }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("USD"),
    estimatedDurationMinutes: integer("estimated_duration_minutes"),
    ...timestampColumns,
  },
  (table) => ({
    routeIdx: index("transport_routes_origin_dest_idx").on(table.originCityId, table.destinationCityId),
  })
);

export const transportBookings = pgTable(
  "transport_bookings",
  {
    id: idColumn(),
    bookingId: uuid("booking_id"), // linked via bookings schema relation
    transportRouteId: uuid("transport_route_id").references(() => transportRoutes.id, { onDelete: "restrict" }),
    vehicleId: uuid("vehicle_id").references(() => vehicles.id),
    travelDate: text("travel_date").notNull(), // stored as date-string; see bookings.ts for date column usage
    passengerCount: integer("passenger_count").notNull().default(1),
    price: numeric("price", { precision: 12, scale: 2 }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("held"),
    ...timestampColumns,
  },
  (table) => ({
    bookingIdx: index("transport_bookings_booking_idx").on(table.bookingId),
  })
);

export const transportProvidersRelations = relations(transportProviders, ({ one, many }) => ({
  tenant: one(tenants, { fields: [transportProviders.tenantId], references: [tenants.id] }),
  operator: one(operators, { fields: [transportProviders.operatorId], references: [operators.id] }),
  vehicles: many(vehicles),
  routes: many(transportRoutes),
}));

export const vehiclesRelations = relations(vehicles, ({ one }) => ({
  provider: one(transportProviders, { fields: [vehicles.transportProviderId], references: [transportProviders.id] }),
  vehicleType: one(vehicleTypes, { fields: [vehicles.vehicleTypeId], references: [vehicleTypes.id] }),
}));
