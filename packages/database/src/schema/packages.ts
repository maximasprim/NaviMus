import {
  boolean,
  date,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { idColumn, softDeleteColumn, tenantIdColumn, timestampColumns } from "./_helpers.js";
import { operators } from "./operators.js";
import { destinations } from "./destinations.js";
import { roomTypes } from "./accommodation.js";
import { transportRoutes } from "./transport.js";
import { tenants } from "./tenants.js";

export const packages = pgTable(
  "packages",
  {
    id: idColumn(),
    tenantId: tenantIdColumn().references(() => tenants.id, { onDelete: "restrict" }),
    operatorId: uuid("operator_id")
      .notNull()
      .references(() => operators.id, { onDelete: "restrict" }),
    name: varchar("name", { length: 200 }).notNull(),
    slug: varchar("slug", { length: 220 }).notNull(),
    // individual|couple|family|group|corporate|school|private|custom|honeymoon|
    // adventure|safari|beach_holiday|cultural|business_travel|conference
    type: varchar("type", { length: 30 }).notNull(),
    description: text("description"),
    shortDescription: varchar("short_description", { length: 500 }),
    durationDays: integer("duration_days").notNull(),
    minGroupSize: integer("min_group_size").notNull().default(1),
    maxGroupSize: integer("max_group_size"),
    baseCurrency: varchar("base_currency", { length: 3 }).notNull().default("USD"),
    inclusions: text("inclusions"), // markdown/plain list; structured table would be over-engineering at this stage
    exclusions: text("exclusions"),
    cancellationPolicyId: uuid("cancellation_policy_id"),
    termsAndConditions: text("terms_and_conditions"),
    visaInformation: text("visa_information"),
    insuranceInformation: text("insurance_information"),
    featuredImageKey: text("featured_image_key"),
    // draft|pending_review|published|archived
    status: varchar("status", { length: 20 }).notNull().default("draft"),
    featured: boolean("featured").notNull().default(false),
    seoTitle: varchar("seo_title", { length: 200 }),
    seoDescription: varchar("seo_description", { length: 300 }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    ...timestampColumns,
    ...softDeleteColumn,
  },
  (table) => ({
    // Was globally unique; now scoped per tenant (same reasoning as operators.slug).
    tenantSlugUnique: uniqueIndex("packages_tenant_slug_unique").on(table.tenantId, table.slug),
    tenantIdx: index("packages_tenant_idx").on(table.tenantId),
    operatorIdx: index("packages_operator_idx").on(table.operatorId),
    statusIdx: index("packages_status_idx").on(table.status),
    typeIdx: index("packages_type_idx").on(table.type),
  })
);

/** Ordered multi-stop itinerary: Nairobi -> Amboseli -> Naivasha -> Masai Mara -> Nairobi. */
export const packageDestinations = pgTable(
  "package_destinations",
  {
    id: idColumn(),
    packageId: uuid("package_id")
      .notNull()
      .references(() => packages.id, { onDelete: "cascade" }),
    destinationId: uuid("destination_id")
      .notNull()
      .references(() => destinations.id, { onDelete: "restrict" }),
    sequenceOrder: integer("sequence_order").notNull().default(0),
    ...timestampColumns,
  },
  (table) => ({
    packageIdx: index("package_destinations_package_idx").on(table.packageId),
    packageSequenceUnique: uniqueIndex("package_destinations_sequence_unique").on(
      table.packageId,
      table.sequenceOrder
    ),
  })
);

export const packageItineraries = pgTable(
  "package_itineraries",
  {
    id: idColumn(),
    packageId: uuid("package_id")
      .notNull()
      .references(() => packages.id, { onDelete: "cascade" }),
    dayNumber: integer("day_number").notNull(),
    title: varchar("title", { length: 200 }),
    description: text("description"),
    ...timestampColumns,
  },
  (table) => ({
    packageDayUnique: uniqueIndex("package_itineraries_day_unique").on(table.packageId, table.dayNumber),
  })
);

export const packageActivities = pgTable(
  "package_activities",
  {
    id: idColumn(),
    packageId: uuid("package_id")
      .notNull()
      .references(() => packages.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 200 }).notNull(),
    description: text("description"),
    isOptional: boolean("is_optional").notNull().default(false),
    additionalPrice: numeric("additional_price", { precision: 12, scale: 2 }),
    currency: varchar("currency", { length: 3 }),
    ...timestampColumns,
  },
  (table) => ({
    packageIdx: index("package_activities_package_idx").on(table.packageId),
  })
);

export const packageInclusions = pgTable(
  "package_inclusions",
  {
    id: idColumn(),
    packageId: uuid("package_id")
      .notNull()
      .references(() => packages.id, { onDelete: "cascade" }),
    label: varchar("label", { length: 300 }).notNull(),
  },
  (table) => ({
    packageIdx: index("package_inclusions_package_idx").on(table.packageId),
  })
);

export const packageExclusions = pgTable(
  "package_exclusions",
  {
    id: idColumn(),
    packageId: uuid("package_id")
      .notNull()
      .references(() => packages.id, { onDelete: "cascade" }),
    label: varchar("label", { length: 300 }).notNull(),
  },
  (table) => ({
    packageIdx: index("package_exclusions_package_idx").on(table.packageId),
  })
);

export const packageTransportOptions = pgTable(
  "package_transport_options",
  {
    id: idColumn(),
    packageId: uuid("package_id")
      .notNull()
      .references(() => packages.id, { onDelete: "cascade" }),
    transportRouteId: uuid("transport_route_id")
      .notNull()
      .references(() => transportRoutes.id, { onDelete: "restrict" }),
    label: varchar("label", { length: 150 }), // "Option A: Standard Van" / "Option B: 4x4 Land Cruiser"
    priceOverride: numeric("price_override", { precision: 12, scale: 2 }),
    isDefault: boolean("is_default").notNull().default(false),
  },
  (table) => ({
    packageIdx: index("package_transport_options_package_idx").on(table.packageId),
  })
);

export const packageAccommodationOptions = pgTable(
  "package_accommodation_options",
  {
    id: idColumn(),
    packageId: uuid("package_id")
      .notNull()
      .references(() => packages.id, { onDelete: "cascade" }),
    roomTypeId: uuid("room_type_id")
      .notNull()
      .references(() => roomTypes.id, { onDelete: "restrict" }),
    label: varchar("label", { length: 150 }),
    isDefault: boolean("is_default").notNull().default(false),
  },
  (table) => ({
    packageIdx: index("package_accommodation_options_package_idx").on(table.packageId),
  })
);

/**
 * Price matrix: one row per (traveler type x pricing type x optional season).
 * Server-side price calculation always reads from here - never from client input.
 */
export const packagePrices = pgTable(
  "package_prices",
  {
    id: idColumn(),
    packageId: uuid("package_id")
      .notNull()
      .references(() => packages.id, { onDelete: "cascade" }),
    travelerType: varchar("traveler_type", { length: 10 }).notNull(), // adult|child|infant
    pricingType: varchar("pricing_type", { length: 20 }).notNull().default("individual"), // individual|group|private
    seasonLabel: varchar("season_label", { length: 50 }), // null = year-round default
    seasonStartDate: date("season_start_date"),
    seasonEndDate: date("season_end_date"),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),
    ...timestampColumns,
  },
  (table) => ({
    packageIdx: index("package_prices_package_idx").on(table.packageId),
  })
);

/**
 * One row per bookable travel date. `bookedCount` is only ever
 * mutated inside a DB transaction with a row lock (SELECT ...
 * FOR UPDATE) to prevent overselling under concurrent checkouts.
 */
export const packageAvailability = pgTable(
  "package_availability",
  {
    id: idColumn(),
    packageId: uuid("package_id")
      .notNull()
      .references(() => packages.id, { onDelete: "cascade" }),
    travelDate: date("travel_date").notNull(),
    totalCapacity: integer("total_capacity").notNull(),
    bookedCount: integer("booked_count").notNull().default(0),
    status: varchar("status", { length: 20 }).notNull().default("open"), // open|closed|sold_out
    ...timestampColumns,
  },
  (table) => ({
    packageDateUnique: uniqueIndex("package_availability_package_date_unique").on(
      table.packageId,
      table.travelDate
    ),
  })
);

export const packageCapacity = pgTable(
  "package_capacity",
  {
    id: idColumn(),
    packageId: uuid("package_id")
      .notNull()
      .references(() => packages.id, { onDelete: "cascade" }),
    defaultCapacity: integer("default_capacity").notNull(),
    ...timestampColumns,
  },
  (table) => ({
    packageIdx: uniqueIndex("package_capacity_package_unique").on(table.packageId),
  })
);

export const packagesRelations = relations(packages, ({ one, many }) => ({
  tenant: one(tenants, { fields: [packages.tenantId], references: [tenants.id] }),
  operator: one(operators, { fields: [packages.operatorId], references: [operators.id] }),
  destinations: many(packageDestinations),
  itineraries: many(packageItineraries),
  activities: many(packageActivities),
  inclusions: many(packageInclusions),
  exclusions: many(packageExclusions),
  transportOptions: many(packageTransportOptions),
  accommodationOptions: many(packageAccommodationOptions),
  prices: many(packagePrices),
  availability: many(packageAvailability),
}));

export const packageDestinationsRelations = relations(packageDestinations, ({ one }) => ({
  package: one(packages, { fields: [packageDestinations.packageId], references: [packages.id] }),
  destination: one(destinations, { fields: [packageDestinations.destinationId], references: [destinations.id] }),
}));
