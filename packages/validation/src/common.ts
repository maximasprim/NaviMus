import { z } from "zod";

/** UUIDv7/v4 identifier - never a raw incrementing integer. */
export const uuidSchema = z.string().uuid();

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.string().optional(),
  order: z.enum(["asc", "desc"]).default("desc"),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

/**
 * E.164-ish international phone validation. Intentionally
 * permissive on formatting (spaces/dashes stripped by consumer)
 * since global customers won't type numbers consistently.
 */
export const phoneSchema = z
  .string()
  .regex(/^\+?[1-9]\d{7,14}$/, "Enter a valid international phone number");

export const emailSchema = z.string().email().max(255).toLowerCase();

export const passwordSchema = z
  .string()
  .min(10, "Password must be at least 10 characters")
  .regex(/[a-z]/, "Password must include a lowercase letter")
  .regex(/[A-Z]/, "Password must include an uppercase letter")
  .regex(/[0-9]/, "Password must include a number");

export const currencySchema = z.enum(["KES", "USD", "EUR", "GBP", "TZS", "UGX", "AED", "ZAR"]);

export const moneySchema = z.object({
  amount: z.number().nonnegative(),
  currency: currencySchema,
});

export const idempotencyKeySchema = z
  .string()
  .min(8)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/, "Idempotency-Key contains invalid characters");

export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

export const latitudeSchema = z.number().min(-90).max(90);
export const longitudeSchema = z.number().min(-180).max(180);
