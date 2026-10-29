import { z } from "zod";
import { idempotencyKeySchema, isoDateSchema, uuidSchema } from "./common.js";

export const travelerInputSchema = z.object({
  travelerId: uuidSchema.optional(), // reuse a saved traveler profile
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  dateOfBirth: isoDateSchema.optional(),
  nationality: z.string().length(2).optional(),
  passportNumber: z.string().max(50).optional(),
  travelerType: z.enum(["adult", "child", "infant"]),
  dietaryRequirements: z.string().max(500).optional(),
  accessibilityRequirements: z.string().max(500).optional(),
});

/**
 * Body for POST /bookings. Note there is deliberately NO price
 * field here - price is always computed server-side from
 * package_prices + availability + promotions. Accepting a client
 * price would violate rule #8/#10 in the engineering brief.
 */
export const createBookingSchema = z.object({
  packageId: uuidSchema,
  travelDate: isoDateSchema,
  travelers: z.array(travelerInputSchema).min(1).max(50),
  transportOptionId: uuidSchema.optional(),
  accommodationRoomTypeId: uuidSchema.optional(),
  airportTransferId: uuidSchema.optional(),
  activityIds: z.array(uuidSchema).max(50).optional(),
  couponCode: z.string().max(50).optional(),
  contactEmail: z.string().email(),
  contactPhone: z.string().min(7).max(20),
  specialRequests: z.string().max(2000).optional(),
});
export type CreateBookingInput = z.infer<typeof createBookingSchema>;

export const createBookingHeadersSchema = z.object({
  "idempotency-key": idempotencyKeySchema,
});

export const cancelBookingSchema = z.object({
  reason: z.string().max(1000).optional(),
});
