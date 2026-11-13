import { z } from "zod";
import { emailSchema, idempotencyKeySchema, isoDateSchema, phoneSchema, uuidSchema } from "./common.js";

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

/**
 * Admin corrects a booking's non-financial details. Status and money are deliberately NOT editable here:
 * status only changes through the state machine, and totals are server-computed.
 */
export const adminUpdateBookingSchema = z
  .object({
    contactEmail: emailSchema.optional(),
    contactPhone: phoneSchema.optional(),
    specialRequests: z.string().max(2000).nullable().optional(),
    travelDate: isoDateSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" });

/** A traveler's profile details, corrected by an admin. Price, type and the booking link are not editable here. */
export const adminUpdateTravelerSchema = z
  .object({
    firstName: z.string().trim().min(1).max(100).optional(),
    lastName: z.string().trim().min(1).max(100).optional(),
    dateOfBirth: isoDateSchema.nullable().optional(),
    gender: z.string().trim().max(20).nullable().optional(),
    nationality: z.string().trim().length(2).toUpperCase().nullable().optional(),
    passportExpiryDate: isoDateSchema.nullable().optional(),
    phone: z.string().trim().max(32).nullable().optional(),
    email: z.string().trim().email().max(255).nullable().optional(),
    emergencyContactName: z.string().trim().max(200).nullable().optional(),
    emergencyContactPhone: z.string().trim().max(32).nullable().optional(),
    dietaryRequirements: z.string().trim().max(2000).nullable().optional(),
    accessibilityRequirements: z.string().trim().max(2000).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" });
export type AdminUpdateTravelerInput = z.infer<typeof adminUpdateTravelerSchema>;
export type AdminUpdateBookingInput = z.infer<typeof adminUpdateBookingSchema>;
