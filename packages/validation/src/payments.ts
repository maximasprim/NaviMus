import { z } from "zod";
import { currencySchema, uuidSchema } from "./common.js";

export const createPaymentIntentSchema = z.object({
  bookingId: uuidSchema,
  provider: z.enum(["mpesa", "stripe", "mock"]),
  phoneNumber: z
    .string()
    .regex(/^\+?[1-9]\d{7,14}$/)
    .optional(), // required for mpesa, validated in the service layer
});
export type CreatePaymentIntentInput = z.infer<typeof createPaymentIntentSchema>;

export const refundRequestSchema = z.object({
  paymentId: uuidSchema,
  amount: z.number().positive().optional(), // omit for full refund
  reason: z.string().max(1000).optional(),
});
export type RefundRequestInput = z.infer<typeof refundRequestSchema>;

/**
 * Raw webhook bodies are intentionally NOT strictly schema-validated
 * here - provider payloads vary and are validated by signature, not
 * shape. This schema only covers the query/header envelope some
 * routes use to select the provider.
 */
export const webhookProviderParamSchema = z.object({
  provider: z.enum(["mpesa", "stripe", "mock"]),
});

export const moneyAmountSchema = z.object({
  amount: z.number().positive(),
  currency: currencySchema,
});
