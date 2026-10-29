import { z } from "zod";
import { currencySchema, isoDateSchema, paginationQuerySchema, uuidSchema } from "./common.js";

const accommodationTypeSchema = z.enum([
  "hotel",
  "lodge",
  "resort",
  "villa",
  "apartment",
  "cottage",
  "camp",
  "guest_house",
  "eco_lodge",
  "glamping",
]);

export const createAccommodationSchema = z.object({
  cityId: uuidSchema,
  name: z.string().min(2).max(200),
  slug: z
    .string()
    .min(2)
    .max(220)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  type: accommodationTypeSchema,
  description: z.string().max(20_000).optional(),
  starRating: z.number().int().min(1).max(5).optional(),
  amenities: z.array(z.string().max(100)).max(50).optional(),
  checkInTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
  checkOutTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
});
export type CreateAccommodationInput = z.infer<typeof createAccommodationSchema>;

export const createRoomTypeSchema = z.object({
  name: z.string().min(2).max(150),
  maxOccupancy: z.number().int().min(1).default(2),
  basePricePerNight: z.number().nonnegative(),
  currency: currencySchema,
  mealPlan: z.enum(["room_only", "breakfast", "half_board", "full_board", "all_inclusive"]).optional(),
});
export type CreateRoomTypeInput = z.infer<typeof createRoomTypeSchema>;

export const accommodationSearchQuerySchema = paginationQuerySchema.extend({
  cityId: uuidSchema.optional(),
  type: accommodationTypeSchema.optional(),
  q: z.string().max(200).optional(),
});
export type AccommodationSearchQuery = z.infer<typeof accommodationSearchQuerySchema>;

export const roomAvailabilityQuerySchema = z.object({
  checkIn: isoDateSchema,
  checkOut: isoDateSchema,
});

export const bookRoomSchema = z.object({
  roomTypeId: uuidSchema,
  checkInDate: isoDateSchema,
  checkOutDate: isoDateSchema,
  roomsRequested: z.number().int().min(1).default(1),
});
export type BookRoomInput = z.infer<typeof bookRoomSchema>;
