import { z } from "zod";
import { emailSchema, paginationQuerySchema, phoneSchema, uuidSchema } from "./common.js";

export const registerOperatorSchema = z.object({
  businessName: z.string().min(2).max(200),
  slug: z
    .string()
    .min(2)
    .max(220)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  contactEmail: emailSchema,
  contactPhone: phoneSchema.optional(),
  countryId: uuidSchema.optional(),
  description: z.string().max(5000).optional(),
});
export type RegisterOperatorInput = z.infer<typeof registerOperatorSchema>;

export const reviewOperatorSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  reason: z.string().max(1000).optional(),
});
export type ReviewOperatorInput = z.infer<typeof reviewOperatorSchema>;

export const inviteOperatorStaffSchema = z.object({
  userId: uuidSchema,
  title: z.string().max(100).optional(),
});
export type InviteOperatorStaffInput = z.infer<typeof inviteOperatorStaffSchema>;

export const submitOperatorDocumentSchema = z.object({
  documentType: z.string().min(2).max(50),
  storageKey: z.string().min(1),
});
export type SubmitOperatorDocumentInput = z.infer<typeof submitOperatorDocumentSchema>;

export const reviewOperatorDocumentSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
});

export const operatorSearchQuerySchema = paginationQuerySchema.extend({
  status: z.enum(["pending", "approved", "rejected", "suspended"]).optional(),
});
export type OperatorSearchQuery = z.infer<typeof operatorSearchQuerySchema>;

export const setCommissionRateSchema = z.object({
  commissionRatePercent: z.number().min(0).max(100),
});
