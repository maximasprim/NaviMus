import { z } from "zod";

/**
 * Allow-list of accepted upload categories - kept narrow rather
 * than a free-text string, since the category determines both the
 * storage path prefix and (implicitly) which content types are
 * sensible for it.
 */
export const mediaCategorySchema = z.enum([
  "destination_image",
  "destination_video",
  // A tenant's home-page hero background clip (Admin -> Site content -> Home page). Tenant admins only.
  "hero_video",
  "package_image",
  "accommodation_image",
  "review_image",
  "operator_document",
  "invoice",
  "receipt",
  "travel_document",
]);

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"] as const;
const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/webm"] as const;
/** Per-category size ceilings tighter than the 50MB schema-wide cap. A hero clip is a muted 10-15s loop. */
export const MAX_UPLOAD_BYTES_BY_CATEGORY: Partial<Record<z.infer<typeof mediaCategorySchema>, number>> = {
  hero_video: 15 * 1024 * 1024,
};

const ALLOWED_DOCUMENT_TYPES = ["application/pdf", "image/jpeg", "image/png"] as const;

export const requestUploadUrlSchema = z
  .object({
    category: mediaCategorySchema,
    fileName: z.string().min(1).max(255),
    contentType: z.string().min(1).max(100),
    /** Client-reported size, used only for an early friendly error - the storage
     * provider's own policy is the actual enforcement point, never trust this alone. */
    sizeBytes: z.number().int().positive().max(50 * 1024 * 1024), // 50MB hard ceiling at the schema level
  })
  .superRefine((data, ctx) => {
    const allowed: readonly string[] =
      data.category === "destination_video" || data.category === "hero_video"
        ? ALLOWED_VIDEO_TYPES
        : data.category === "operator_document" || data.category === "invoice" || data.category === "receipt" || data.category === "travel_document"
          ? ALLOWED_DOCUMENT_TYPES
          : ALLOWED_IMAGE_TYPES;

    const categoryMax = MAX_UPLOAD_BYTES_BY_CATEGORY[data.category];
    if (categoryMax !== undefined && data.sizeBytes > categoryMax) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sizeBytes"],
        message: `File is too large for "${data.category}" (max ${Math.floor(categoryMax / (1024 * 1024))}MB)`,
      });
    }

    if (!allowed.includes(data.contentType)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["contentType"],
        message: `${data.contentType} is not allowed for category "${data.category}". Allowed: ${allowed.join(", ")}`,
      });
    }
  });
/**
 * Categories only a tenant admin may mint upload URLs for. These end up on the public storefront, so an
 * ordinary customer account (who can otherwise request upload URLs, e.g. for review photos) must not.
 */
export const ADMIN_ONLY_UPLOAD_CATEGORIES: readonly z.infer<typeof mediaCategorySchema>[] = ["hero_video"];

/**
 * Public URL for a storage key behind an optional CDN: `<cdnBase>/<key>`. Returns null when no CDN is
 * configured, so the caller falls back to the storage provider's own URL (the behaviour before CDN support).
 */
export function buildCdnUrl(cdnBase: string | undefined | null, storageKey: string): string | null {
  const base = (cdnBase ?? "").trim().replace(/\/+$/, "");
  if (!base) return null;
  return `${base}/${storageKey.replace(/^\/+/, "")}`;
}

/**
 * Hosts a tenant may link NEW hero videos from. An empty list means "no restriction" (local development
 * with nothing configured). Inputs are full URLs or bare hosts; anything unparsable is ignored.
 */
export function collectAllowedVideoHosts(...sources: Array<string | undefined | null>): string[] {
  const hosts = new Set<string>();
  for (const source of sources) {
    for (const part of (source ?? "").split(",")) {
      const raw = part.trim();
      if (!raw) continue;
      try {
        hosts.add(new URL(raw.includes("://") ? raw : `https://${raw}`).hostname.toLowerCase());
      } catch {
        // ignore
      }
    }
  }
  return [...hosts];
}

/** True when `url` is https and its host is exactly one of `allowedHosts`. */
export function isAllowedVideoUrl(url: string, allowedHosts: readonly string[]): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && allowedHosts.includes(u.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export type RequestUploadUrlInput = z.infer<typeof requestUploadUrlSchema>;

export const confirmUploadSchema = z.object({
  storageKey: z.string().min(1).max(500),
});
