import { doublePrecision, index, pgTable, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { idColumn, timestampColumns } from "./_helpers.js";

export const countries = pgTable(
  "countries",
  {
    id: idColumn(),
    isoCode: varchar("iso_code", { length: 2 }).notNull(), // ISO 3166-1 alpha-2
    name: varchar("name", { length: 100 }).notNull(),
    ...timestampColumns,
  },
  (table) => ({
    isoUnique: uniqueIndex("countries_iso_unique").on(table.isoCode),
  })
);

export const regions = pgTable(
  "regions",
  {
    id: idColumn(),
    countryId: uuid("country_id")
      .notNull()
      .references(() => countries.id, { onDelete: "restrict" }),
    name: varchar("name", { length: 100 }).notNull(),
    ...timestampColumns,
  },
  (table) => ({
    countryIdx: index("regions_country_idx").on(table.countryId),
    countryNameUnique: uniqueIndex("regions_country_name_unique").on(table.countryId, table.name),
  })
);

export const cities = pgTable(
  "cities",
  {
    id: idColumn(),
    regionId: uuid("region_id")
      .notNull()
      .references(() => regions.id, { onDelete: "restrict" }),
    name: varchar("name", { length: 100 }).notNull(),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    ...timestampColumns,
  },
  (table) => ({
    regionIdx: index("cities_region_idx").on(table.regionId),
  })
);

export const countriesRelations = relations(countries, ({ many }) => ({
  regions: many(regions),
}));

export const regionsRelations = relations(regions, ({ one, many }) => ({
  country: one(countries, { fields: [regions.countryId], references: [countries.id] }),
  cities: many(cities),
}));

export const citiesRelations = relations(cities, ({ one }) => ({
  region: one(regions, { fields: [cities.regionId], references: [regions.id] }),
}));
