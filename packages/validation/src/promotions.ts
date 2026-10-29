import { z } from "zod";
import { currencySchema, isoDateSchema, uuidSchema } from "./common.js";

export const createCouponSchema = z.object({
  code: z
    .string()
    .min(3)
    .max(50)
    .regex(/^[A-Za-z0-9_-]+$/),
  operatorId: uuidSchema.optional(), // omit for a platform-wide coupon
  discountType: z.enum(["percentage", "fixed_amount"]),
  discountValue: z.number().positive(),
  currency: currencySchema.optional(), // required when discountType is fixed_amount
  maxUses: z.number().int().positive().optional(),
  minBookingAmount: z.number().nonnegative().optional(),
  validFrom: isoDateSchema.optional(),
  validUntil: isoDateSchema.optional(),
});
export type CreateCouponInput = z.infer<typeof createCouponSchema>;

export const validateCouponSchema = z.object({
  code: z.string().min(1).max(50),
  bookingAmount: z.number().nonnegative(),
  currency: currencySchema,
});
export type ValidateCouponInput = z.infer<typeof validateCouponSchema>;

export const createPromotionSchema = z.object({
  name: z.string().min(2).max(200),
  type: z.enum(["seasonal", "early_booking", "group", "last_minute", "flash_sale", "loyalty", "partner"]),
  description: z.string().max(500).optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
});
export type CreatePromotionInput = z.infer<typeof createPromotionSchema>;
