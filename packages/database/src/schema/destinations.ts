import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { idColumn, softDeleteColumn, tenantIdColumn, timestampColumns } from "./_helpers.js";
import { cities } from "./geography.js";
import { tenants } from "./tenants.js";

export const destinationCategories = pgTable(
  "destination_categories",
  {
    id: idColumn(),
    tenantId: tenantIdColumn().references(() => tenants.id, { onDelete: "restrict" }),
    name: varchar("name", { length: 100 }).notNull(),
    slug: varchar("slug", { length: 120 }).notNull(),
    parentId: uuid("parent_id"),
    description: text("description"),
    ...timestampColumns,
  },
  (table) => ({
    tenantSlugUnique: uniqueIndex("destination_categories_tenant_slug_unique").on(table.tenantId, table.slug),
    tenantIdx: index("destination_categories_tenant_idx").on(table.tenantId),
    parentIdx: index("destination_categories_parent_idx").on(table.parentId),
  })
);

export const destinations = pgTable(
  "destinations",
  {
    id: idColumn(),
    tenantId: tenantIdColumn().references(() => tenants.id, { onDelete: "restrict" }),
    cityId: uuid("city_id")
      .notNull()
      .references(() => cities.id, { onDelete: "restrict" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => destinationCategories.id, { onDelete: "restrict" }),
    name: varchar("name", { length: 200 }).notNull(),
    slug: varchar("slug", { length: 220 }).notNull(),
    description: text("description"),
    shortDescription: varchar("short_description", { length: 500 }),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    timezone: varchar("timezone", { length: 64 }),
    featuredImageKey: text("featured_image_key"),
    openingHours: jsonb("opening_hours"), // structured per-day hours
    bestTimeToVisit: varchar("best_time_to_visit", { length: 500 }),
    averageDurationHours: integer("average_duration_hours"),
    entryRequirements: text("entry_requirements"),
    safetyInformation: text("safety_information"),
    travelInformation: text("travel_information"),
    weatherInformation: text("weather_information"),
    accessibilityInformation: text("accessibility_information"),
    minimumAge: integer("minimum_age"),
    maximumCapacity: integer("maximum_capacity"),
    // draft|pending_review|published|archived - enforced in app layer
    status: varchar("status", { length: 20 }).notNull().default("draft"),
    featured: boolean("featured").notNull().default(false),
    verified: boolean("verified").notNull().default(false),
    seoTitle: varchar("seo_title", { length: 200 }),
    seoDescription: varchar("seo_description", { length: 300 }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    ...timestampColumns,
    ...softDeleteColumn,
  },
  (table) => ({
    // Was (cityId, slug) - cities are shared platform-wide reference data
    // (see geography.ts), so two tenants both operating in Nairobi need
    // their own "beach" destination without colliding on the same city.
    tenantCitySlugUnique: uniqueIndex("destinations_tenant_city_slug_unique").on(
      table.tenantId,
      table.cityId,
      table.slug
    ),
    tenantIdx: index("destinations_tenant_idx").on(table.tenantId),
    categoryIdx: index("destinations_category_idx").on(table.categoryId),
    statusIdx: index("destinations_status_idx").on(table.status),
    featuredIdx: index("destinations_featured_idx").on(table.featured),
  })
);

export const destinationImages = pgTable(
  "destination_images",
  {
    id: idColumn(),
    destinationId: uuid("destination_id")
      .notNull()
      .references(() => destinations.id, { onDelete: "cascade" }),
    storageKey: text("storage_key").notNull(),
    altText: varchar("alt_text", { length: 300 }),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestampColumns,
  },
  (table) => ({
    destinationIdx: index("destination_images_destination_idx").on(table.destinationId),
  })
);

export const destinationVideos = pgTable(
  "destination_videos",
  {
    id: idColumn(),
    destinationId: uuid("destination_id")
      .notNull()
      .references(() => destinations.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    title: varchar("title", { length: 200 }),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestampColumns,
  },
  (table) => ({
    destinationIdx: index("destination_videos_destination_idx").on(table.destinationId),
  })
);

export const destinationAmenities = pgTable(
  "destination_amenities",
  {
    id: idColumn(),
    destinationId: uuid("destination_id")
      .notNull()
      .references(() => destinations.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 100 }).notNull(),
    ...timestampColumns,
  },
  (table) => ({
    destinationIdx: index("destination_amenities_destination_idx").on(table.destinationId),
  })
);

export const destinationActivities = pgTable(
  "destination_activities",
  {
    id: idColumn(),
    destinationId: uuid("destination_id")
      .notNull()
      .references(() => destinations.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 150 }).notNull(),
    description: text("description"),
    ...timestampColumns,
  },
  (table) => ({
    destinationIdx: index("destination_activities_destination_idx").on(table.destinationId),
  })
);

export const destinationCategoriesRelations = relations(destinationCategories, ({ many, one }) => ({
  tenant: one(tenants, { fields: [destinationCategories.tenantId], references: [tenants.id] }),
  destinations: many(destinations),
  parent: one(destinationCategories, {
    fields: [destinationCategories.parentId],
    references: [destinationCategories.id],
  }),
}));

export const destinationsRelations = relations(destinations, ({ one, many }) => ({
  tenant: one(tenants, { fields: [destinations.tenantId], references: [tenants.id] }),
  city: one(cities, { fields: [destinations.cityId], references: [cities.id] }),
  category: one(destinationCategories, { fields: [destinations.categoryId], references: [destinationCategories.id] }),
  images: many(destinationImages),
  videos: many(destinationVideos),
  amenities: many(destinationAmenities),
  activities: many(destinationActivities),
}));
