import { z } from "zod";
import { config as loadDotenvFile } from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
loadDotenvFile({ path: path.resolve(here, "../../../.env") });

/**
 * Single source of truth for environment configuration.
 * Every service imports `env` from here instead of reading
 * process.env directly, so a missing/invalid variable fails
 * fast at boot instead of surfacing as a runtime bug later.
 */

const envSchema = z
  .object({
  NODE_ENV: z.enum(["development", "test", "staging", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),

  // What the API connects as at runtime. Must be the low-privilege
  // `travel_app` role so row-level security applies (see docs/RLS.md).
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  // Owner role used ONLY for migrations/seeds. Falls back to DATABASE_URL.
  DATABASE_MIGRATION_URL: z.string().optional(),
  DB_POOL_MAX: z.coerce.number().int().positive().default(20),
  // Pool for background event consumers, kept separate and small so slow
  // jobs (sending email/SMS) can't starve API requests of connections.
  EVENTS_DB_POOL_MAX: z.coerce.number().int().positive().default(5),
  // Production refuses to boot if the DB role can bypass RLS. Set to
  // "false" only as a deliberate, temporary escape hatch.
  REQUIRE_RLS: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),

  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  STORAGE_BUCKET: z.string().default("travel-platform-media"),
  // Optional CDN in front of the storage bucket (e.g. https://media.example.com). When set, the public URLs the
  // media service hands out use this base instead of the Supabase one: <MEDIA_CDN_URL>/<storage key>. It must
  // serve the same objects as the bucket's public path (see docs/MEDIA.md). Unset = Supabase URLs, as before.
  // (A blank value, as in .env.example, counts as unset rather than failing boot.)
  MEDIA_CDN_URL: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.string().url().optional()),
  // Extra hosts (comma-separated) a tenant may link hero background videos from, besides the Supabase and
  // CDN hosts above. Only used to vet NEW video links when saving site content; unset adds nothing.
  MEDIA_ALLOWED_VIDEO_HOSTS: z.string().optional(),

  REDIS_URL: z.string().min(1, "REDIS_URL is required"),

  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  // 32-byte key (as 64 hex chars) for AES-256-GCM field-level encryption
  // of sensitive data at rest - currently just traveler passport numbers
  // (section 19/33: "Sensitive personal information must be encrypted").
  // Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-f]{64}$/i, "ENCRYPTION_KEY must be 64 hex characters (32 bytes)")
    .optional(),
  // Set only while rotating ENCRYPTION_KEY - see packages/auth/src/encryption.ts.
  ENCRYPTION_KEY_PREVIOUS: z
    .string()
    .regex(/^[0-9a-f]{64}$/i, "ENCRYPTION_KEY_PREVIOUS must be 64 hex characters (32 bytes)")
    .optional(),
  JWT_REFRESH_SECRET: z.string().min(32, "JWT_REFRESH_SECRET must be at least 32 characters"),
  JWT_ACCESS_TTL: z.string().default("15m"),
  JWT_REFRESH_TTL: z.string().default("30d"),

  MPESA_CONSUMER_KEY: z.string().optional(),
  MPESA_CONSUMER_SECRET: z.string().optional(),
  MPESA_SHORTCODE: z.string().optional(),
  MPESA_PASSKEY: z.string().optional(),
  MPESA_ENV: z.enum(["sandbox", "production"]).default("sandbox"),
  // Public base URL of THIS api gateway as Safaricom/Stripe see it (e.g.
  // https://api.yourdomain.com, or an ngrok URL in dev). Used to build
  // the per-payment M-Pesa callback URL - previously hardcoded to
  // example domains, which meant no real callback could ever arrive.
  PUBLIC_API_URL: z.string().url().optional(),
  // Daraja does not sign callbacks, so authenticity comes from a secret
  // baked into each payment's own callback URL (HMAC of the payment id).
  // Hex only, on purpose: Safaricom rejects callback URLs containing
  // certain keywords, and a hex alphabet can't spell any of them.
  // Generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  MPESA_CALLBACK_SECRET: z
    .string()
    .regex(/^[0-9a-f]{32,}$/i, "MPESA_CALLBACK_SECRET must be at least 32 hex characters")
    .optional(),
  // Optional comma-separated allowlist of source IPs for M-Pesa callbacks
  // (Safaricom publishes theirs). Defence in depth on top of the signed
  // URL. Only meaningful behind a proxy you trust to set X-Forwarded-For.
  MPESA_CALLBACK_IP_ALLOWLIST: z.string().optional(),
  // Daraja Transaction Reversal (M-Pesa refunds). Both must be set to enable
  // automated refunds; otherwise M-Pesa refunds fail loudly and are done by hand.
  // MPESA_SECURITY_CREDENTIAL is the initiator password RSA-encrypted with
  // Safaricom's public certificate for your environment, base64-encoded
  // (generate it once offline - the password itself is never given to this app).
  MPESA_INITIATOR_NAME: z.string().optional(),
  MPESA_SECURITY_CREDENTIAL: z.string().optional(),
  // After a "paid" callback, ask Daraja directly (STK Push Query) whether
  // the payment really succeeded before crediting anything.
  MPESA_VERIFY_WITH_QUERY: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),

  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  // SaaS billing (tenants paying for their plan) uses its OWN webhook
  // endpoint (/api/v1/billing/webhooks/stripe), and Stripe gives every
  // endpoint its own signing secret - so this is NOT STRIPE_WEBHOOK_SECRET,
  // which belongs to the customer-booking payments endpoint.
  STRIPE_BILLING_WEBHOOK_SECRET: z.string().optional(),
  // Comma-separated browser origins allowed to call the API cross-origin, e.g.
  // "https://app.example.com,https://*.example.com". Optional: the web apps use a
  // same-origin proxy and need no CORS at all. Never credentialed. See packages/http/src/cors.ts.
  CORS_ALLOWED_ORIGINS: z.string().optional(),
  // Where Stripe Checkout / the Billing Portal send tenants back to.
  ADMIN_APP_URL: z.string().url().optional(),

  EMAIL_PROVIDER: z.enum(["resend", "sendgrid", "ses", "mock"]).default("mock"),
  EMAIL_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default("bookings@example-travel.com"),

  SMS_PROVIDER: z.enum(["africastalking", "twilio", "mock"]).default("mock"),
  SMS_API_KEY: z.string().optional(),

  WHATSAPP_PROVIDER: z.enum(["twilio", "meta", "mock"]).default("mock"),
  WHATSAPP_API_KEY: z.string().optional(),

  MAPS_PROVIDER: z.enum(["google", "mapbox", "mock"]).default("mock"),
  MAPS_API_KEY: z.string().optional(),

  // Base URL of the customer web app - used to build links inside
  // transactional emails (password reset, email verification) since the
  // backend has no other way to know where the frontend is deployed.
  FRONTEND_URL: z.string().url().default("http://localhost:3000"),

  // "static" ships a fixed, periodically-updated rate table checked into
  // this repo (packages/currency) - correct enough for display/estimate
  // purposes without an external API dependency. "openexchangerates" is
  // the real live-rate implementation for when accurate settlement-time
  // rates matter; falls back to "static" if no API key is configured.
  CURRENCY_PROVIDER: z.enum(["static", "openexchangerates"]).default("static"),
  EXCHANGE_RATE_API_KEY: z.string().optional(),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().default(100),
  // Ceiling on one TENANT's aggregate traffic (every one of their users
  // and IPs combined) within the same window - separate from
  // RATE_LIMIT_MAX, which caps a single user/IP. Defaults to 20x the
  // per-user max: generous enough that a legitimately busy tenant with
  // many simultaneous customers doesn't get throttled by normal traffic,
  // but still a real ceiling that protects shared infrastructure from
  // one tenant's traffic (or a bug/incident within one tenant) starving
  // every other tenant on the platform.
  RATE_LIMIT_TENANT_MAX: z.coerce.number().optional(),

  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  })
  .superRefine((cfg, ctx) => {
    // Fail at boot, not at the first real payment: in production, if
    // M-Pesa is configured at all, its callbacks must be authenticated
    // and must have somewhere real to land.
    if (cfg.NODE_ENV === "production" && cfg.MPESA_CONSUMER_KEY) {
      if (!cfg.MPESA_CALLBACK_SECRET) {
        ctx.addIssue({ code: "custom", path: ["MPESA_CALLBACK_SECRET"], message: "required in production when M-Pesa is configured" });
      }
      if (!cfg.PUBLIC_API_URL) {
        ctx.addIssue({ code: "custom", path: ["PUBLIC_API_URL"], message: "required in production when M-Pesa is configured" });
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

/**
 * Parses and validates process.env once per process. Throws
 * immediately (and loudly) on startup if required config is
 * missing, rather than letting an undefined secret propagate
 * into, say, JWT signing at request time.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    // eslint-disable-next-line no-console
    console.error(`Invalid environment configuration:\n${issues}`);
    process.exit(1);
  }
  cached = parsed.data;
  return cached;
}

export const env = loadEnv();

export function isProduction(): boolean {
  return env.NODE_ENV === "production";
}
