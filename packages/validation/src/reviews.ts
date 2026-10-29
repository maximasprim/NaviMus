import { z } from "zod";
import { paginationQuerySchema, uuidSchema } from "./common.js";

const reviewSubjectTypeSchema = z.enum([
  "destination",
  "package",
  "accommodation",
  "transport",
  "tour_guide",
  "airport_transfer",
]);

export const createReviewSchema = z.object({
  bookingId: uuidSchema,
  subjectType: reviewSubjectTypeSchema,
  subjectId: uuidSchema,
  rating: z.number().int().min(1).max(5),
  title: z.string().max(200).optional(),
  body: z.string().max(5000).optional(),
});
export type CreateReviewInput = z.infer<typeof createReviewSchema>;

export const respondToReviewSchema = z.object({
  response: z.string().min(1).max(2000),
});
export type RespondToReviewInput = z.infer<typeof respondToReviewSchema>;

export const reportReviewSchema = z.object({
  reason: z.string().max(500).optional(),
});

export const reviewSearchQuerySchema = paginationQuerySchema.extend({
  subjectType: reviewSubjectTypeSchema.optional(),
  subjectId: uuidSchema.optional(),
  minRating: z.coerce.number().int().min(1).max(5).optional(),
});
export type ReviewSearchQuery = z.infer<typeof reviewSearchQuerySchema>;
