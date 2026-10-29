import { z } from "zod";
import { latitudeSchema, longitudeSchema, paginationQuerySchema, uuidSchema } from "./common.js";

export const createDestinationSchema = z.object({
  name: z.string().min(2).max(200),
  slug: z
    .string()
    .min(2)
    .max(220)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens")
    .optional(), // auto-generated from name when omitted
  cityId: uuidSchema,
  categoryId: uuidSchema,
  description: z.string().max(20_000).optional(),
  shortDescription: z.string().max(500).optional(),
  latitude: latitudeSchema.optional(),
  longitude: longitudeSchema.optional(),
  timezone: z.string().max(64).optional(),
  bestTimeToVisit: z.string().max(500).optional(),
  averageDurationHours: z.number().int().positive().optional(),
  minimumAge: z.number().int().min(0).optional(),
  maximumCapacity: z.number().int().positive().optional(),
  featured: z.boolean().default(false),
});
export type CreateDestinationInput = z.infer<typeof createDestinationSchema>;

export const updateDestinationSchema = createDestinationSchema.partial();

export const destinationSearchQuerySchema = paginationQuerySchema.extend({
  country: z.string().length(2).optional(),
  region: z.string().optional(),
  city: z.string().optional(),
  category: uuidSchema.optional(),
  q: z.string().max(200).optional(),
  featured: z.coerce.boolean().optional(),
  minPrice: z.coerce.number().nonnegative().optional(),
  maxPrice: z.coerce.number().nonnegative().optional(),
});
export type DestinationSearchQuery = z.infer<typeof destinationSearchQuerySchema>;

// Note: country/region/city creation schemas live in admin.ts, not here -
// this file previously had duplicate (dead, unused) copies of the same
// three schemas, which collided ambiguously with admin.ts's versions in
// @travel/validation's barrel export. Removed rather than kept, since
// nothing imported these specific ones and admin.ts's are the ones
// actually wired to a route (services/admin/src/routes.ts).

export const createCategorySchema = z.object({
  name: z.string().min(2).max(100),
  parentId: uuidSchema.optional(),
  description: z.string().max(1000).optional(),
});
