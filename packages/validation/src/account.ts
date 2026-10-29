import { z } from "zod";

export const favoriteSchema = z.object({
  subjectType: z.enum(["destination", "package", "accommodation"]),
  subjectId: z.string().uuid(),
});
export type FavoriteInput = z.infer<typeof favoriteSchema>;

export const createSupportTicketSchema = z.object({
  bookingId: z.string().uuid().optional(),
  subject: z.string().min(3).max(300),
  message: z.string().min(1).max(5000),
});
export type CreateSupportTicketInput = z.infer<typeof createSupportTicketSchema>;

export const addSupportMessageSchema = z.object({
  message: z.string().min(1).max(5000),
});

export const updateSupportTicketStatusSchema = z.object({
  status: z.enum(["open", "in_progress", "resolved", "closed"]),
});

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

/**
 * Named distinctly from bookings.ts's `travelerInputSchema` (the
 * per-traveler entry inside a booking's traveler composition) - the two
 * previously shared the same export name, which collided ambiguously in
 * @travel/validation's barrel export and meant whichever module happened
 * to win the collision silently supplied the wrong shape to callers.
 * This one is the saved traveler *profile* schema (account service).
 */
export const travelerProfileInputSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  dateOfBirth: isoDate.optional(),
  gender: z.string().max(20).optional(),
  nationality: z.string().length(2).optional(),
  passportNumber: z.string().min(1).max(50).optional(),
  passportExpiryDate: isoDate.optional(),
  phone: z.string().max(32).optional(),
  email: z.string().email().optional(),
  emergencyContactName: z.string().max(200).optional(),
  emergencyContactPhone: z.string().max(32).optional(),
  dietaryRequirements: z.string().max(1000).optional(),
  accessibilityRequirements: z.string().max(1000).optional(),
});
export type TravelerProfileInput = z.infer<typeof travelerProfileInputSchema>;

export const updateTravelerProfileInputSchema = travelerProfileInputSchema.partial();
