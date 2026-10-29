import { z } from "zod";
import { currencySchema, isoDateSchema, paginationQuerySchema, uuidSchema } from "./common.js";

const packageTypeSchema = z.enum([
  "individual",
  "couple",
  "family",
  "group",
  "corporate",
  "school",
  "private",
  "custom",
  "honeymoon",
  "adventure",
  "safari",
  "beach_holiday",
  "cultural",
  "business_travel",
  "conference",
]);

export const packageItineraryInputSchema = z.object({
  dayNumber: z.number().int().min(1),
  title: z.string().max(200).optional(),
  description: z.string().max(5000).optional(),
});

export const packagePriceInputSchema = z.object({
  travelerType: z.enum(["adult", "child", "infant"]),
  pricingType: z.enum(["individual", "group", "private"]).default("individual"),
  seasonLabel: z.string().max(50).optional(),
  seasonStartDate: isoDateSchema.optional(),
  seasonEndDate: isoDateSchema.optional(),
  amount: z.number().nonnegative(),
  currency: currencySchema,
});

export const createPackageSchema = z.object({
  name: z.string().min(3).max(200),
  slug: z
    .string()
    .min(3)
    .max(220)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  type: packageTypeSchema,
  description: z.string().max(20_000).optional(),
  shortDescription: z.string().max(500).optional(),
  durationDays: z.number().int().min(1).max(365),
  minGroupSize: z.number().int().min(1).default(1),
  maxGroupSize: z.number().int().min(1).optional(),
  baseCurrency: currencySchema.default("USD"),
  inclusions: z.array(z.string().max(300)).max(50).optional(),
  exclusions: z.array(z.string().max(300)).max(50).optional(),
  termsAndConditions: z.string().max(20_000).optional(),
  visaInformation: z.string().max(5000).optional(),
  insuranceInformation: z.string().max(5000).optional(),
  destinationIds: z.array(uuidSchema).min(1).max(20), // ordered stops, sequence = array order
  itineraries: z.array(packageItineraryInputSchema).max(365).optional(),
  prices: z.array(packagePriceInputSchema).min(1).max(100),
  featured: z.boolean().default(false),
});
export type CreatePackageInput = z.infer<typeof createPackageSchema>;

export const updatePackageSchema = createPackageSchema.partial();

export const packageSearchQuerySchema = paginationQuerySchema.extend({
  type: packageTypeSchema.optional(),
  destinationId: uuidSchema.optional(),
  country: z.string().length(2).optional(),
  minPrice: z.coerce.number().nonnegative().optional(),
  maxPrice: z.coerce.number().nonnegative().optional(),
  travelers: z.coerce.number().int().positive().optional(),
  startDate: isoDateSchema.optional(),
  endDate: isoDateSchema.optional(),
  q: z.string().max(200).optional(),
  featured: z.coerce.boolean().optional(),
});
export type PackageSearchQuery = z.infer<typeof packageSearchQuerySchema>;

export const setAvailabilitySchema = z.object({
  travelDate: isoDateSchema,
  totalCapacity: z.number().int().min(0),
});

export const availabilityQuerySchema = z.object({
  from: isoDateSchema,
  to: isoDateSchema,
});
