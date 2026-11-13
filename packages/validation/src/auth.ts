import { z } from "zod";
import { emailSchema, passwordSchema, phoneSchema } from "./common.js";

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  phone: phoneSchema.optional(),
  nationality: z.string().length(2).optional(), // ISO 3166-1 alpha-2
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

/**
 * Admin-console sign-in. No tenant is named: the account is found by email across
 * tenants (see AuthService.adminLogin). `workspace` is only ever sent to disambiguate
 * the rare case of one email + password being a staff account in more than one tenant.
 */
export const adminLoginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
  workspace: z.string().trim().toLowerCase().max(100).optional(),
});
export type AdminLoginInput = z.infer<typeof adminLoginSchema>;

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});

export const requestPasswordResetSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: passwordSchema,
});

export const verifyEmailSchema = z.object({
  token: z.string().min(1),
});

/** Admin creates an account directly (no email round-trip). `tenantId` is honoured for super_admin only. */
export const adminCreateUserSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  phone: phoneSchema.optional(),
  role: z.string().min(1).default("customer"),
  tenantId: z.string().uuid().optional(),
});
export type AdminCreateUserInput = z.infer<typeof adminCreateUserSchema>;

/** Admin edits a user's profile. Only the fields sent are changed. */
export const adminUpdateUserSchema = z
  .object({
    email: emailSchema.optional(),
    firstName: z.string().trim().min(1).max(100).optional(),
    lastName: z.string().trim().min(1).max(100).optional(),
    phone: phoneSchema.nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" });
export type AdminUpdateUserInput = z.infer<typeof adminUpdateUserSchema>;
