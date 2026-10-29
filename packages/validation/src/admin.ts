import { z } from "zod";
import { TENANT_STATUSES } from "@travel/types";
import { currencySchema, emailSchema, isoDateSchema, passwordSchema, phoneSchema, uuidSchema } from "./common.js";

// --- Platform: tenant management (super_admin only) ---
const slugSchema = z
  .string()
  .min(2)
  .max(100)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Lowercase letters, numbers, and single hyphens only");

export const createTenantSchema = z.object({
  name: z.string().min(2).max(200),
  slug: slugSchema.optional(), // omit = derived from name
  ownerEmail: emailSchema,
  ownerPassword: passwordSchema,
  ownerFirstName: z.string().min(1).max(100),
  ownerLastName: z.string().min(1).max(100),
  ownerPhone: phoneSchema.optional(),
});
export type CreateTenantInput = z.infer<typeof createTenantSchema>;

/**
 * Same shape as createTenantSchema - kept as a distinct export rather
 * than a bare alias so the self-serve signup route (services/admin's
 * public-routes.ts) and the super_admin creation route
 * (platform-routes.ts) can diverge later (e.g. a "terms accepted"
 * checkbox or a CAPTCHA token only self-serve needs) without touching
 * the other.
 */
export const selfServeSignupSchema = createTenantSchema;
export type SelfServeSignupInput = z.infer<typeof selfServeSignupSchema>;

export const listTenantsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(TENANT_STATUSES).optional(),
});
export type ListTenantsQuery = z.infer<typeof listTenantsQuerySchema>;

export const updateTenantSchema = z.object({
  name: z.string().min(2).max(200).optional(),
  settings: z.record(z.unknown()).optional(),
});
export type UpdateTenantInput = z.infer<typeof updateTenantSchema>;

export const suspendTenantSchema = z.object({
  reason: z.string().max(1000).optional(),
});
export type SuspendTenantInput = z.infer<typeof suspendTenantSchema>;

export const setCustomDomainSchema = z.object({
  domain: z
    .string()
    .min(3)
    .max(255)
    .regex(/^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i, "Must be a valid domain, e.g. acmetravel.com"),
});
export type SetCustomDomainInput = z.infer<typeof setCustomDomainSchema>;

export const assignPlanSchema = z.object({
  planId: uuidSchema.nullable(),
});
export type AssignPlanInput = z.infer<typeof assignPlanSchema>;

export const hardDeleteTenantSchema = z.object({
  confirmSlug: z.string().min(1),
});
export type HardDeleteTenantInput = z.infer<typeof hardDeleteTenantSchema>;

export const dashboardMetricsQuerySchema = z.object({
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
});
export type DashboardMetricsQuery = z.infer<typeof dashboardMetricsQuerySchema>;

export const updateSystemSettingSchema = z.object({
  key: z.string().min(1).max(100),
  value: z.union([z.string(), z.number(), z.boolean(), z.record(z.unknown()), z.array(z.unknown())]),
  description: z.string().max(500).optional(),
});
export type UpdateSystemSettingInput = z.infer<typeof updateSystemSettingSchema>;

export const createCancellationPolicySchema = z.object({
  operatorId: uuidSchema,
  name: z.string().min(2).max(150),
  rules: z
    .array(
      z.object({
        daysBeforeMin: z.number().int().min(0),
        daysBeforeMax: z.number().int().min(0).optional(), // omit = unbounded ("30+ days")
        refundPercentage: z.number().min(0).max(100),
        penaltyPercentage: z.number().min(0).max(100).default(0),
      })
    )
    .min(1)
    .max(20),
});
export type CreateCancellationPolicyInput = z.infer<typeof createCancellationPolicySchema>;

export const moderateReviewSchema = z.object({
  status: z.enum(["published", "removed"]),
});

export const approveDestinationSchema = z.object({
  decision: z.enum(["published", "rejected"]),
  reason: z.string().max(1000).optional(),
});

export const approvePackageSchema = z.object({
  decision: z.enum(["published", "rejected"]),
  reason: z.string().max(1000).optional(),
});

// --- Reference data (spec section 44) ---
export const createCountrySchema = z.object({
  isoCode: z.string().length(2),
  name: z.string().min(1).max(100),
});

export const createRegionSchema = z.object({
  countryId: z.string().uuid(),
  name: z.string().min(1).max(100),
});

export const createCitySchema = z.object({
  regionId: z.string().uuid(),
  name: z.string().min(1).max(100),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
});

export const createDestinationCategorySchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(120),
  parentId: z.string().uuid().optional(),
  description: z.string().max(2000).optional(),
});

// Note: createTransferLocationSchema lives in logistics.ts, not here - this
// file previously had a duplicate (dead here, but colliding) copy of the
// same schema, which the transfers service's routes.ts already depends on
// getting unambiguously from logistics.ts.

export const upsertNotificationTemplateSchema = z.object({
  key: z.string().min(1).max(100),
  channel: z.enum(["email", "sms", "whatsapp", "push", "in_app"]),
  locale: z.string().max(10).optional(),
  subject: z.string().max(300).optional(),
  bodyTemplate: z.string().min(1),
});
