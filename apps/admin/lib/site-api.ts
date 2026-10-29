import { apiFetch } from "./api-client";

/**
 * API for a tenant's public site content (Site content page). The document's shape and limits are
 * owned by the backend (@travel/validation, packages/validation/src/site-content.ts); these types
 * mirror it so the editor can be typed without importing that package into the browser bundle.
 */

export interface SiteCta {
  label: string;
  href: string;
}
export interface SiteStat {
  value: string;
  label: string;
}
export interface SiteStep {
  title: string;
  body: string;
}
export interface SiteTestimonial {
  quote: string;
  name: string;
  trip?: string;
  photoUrl?: string;
}

export interface SiteContent {
  brand?: { siteName?: string; tagline?: string; logoUrl?: string; footerTagline?: string; copyright?: string };
  seo?: { title?: string; description?: string; ogImageUrl?: string };
  hero?: {
    headline?: string;
    subheadline?: string;
    primaryCta?: SiteCta;
    secondaryCta?: SiteCta;
    stats?: SiteStat[];
    routeStops?: string[];
    videoUrls?: string[];
  };
  stats?: { items?: SiteStat[] };
  sections?: { destinationsHeading?: string; destinationsIntro?: string; packagesHeading?: string; packagesIntro?: string };
  howItWorks?: { heading?: string; intro?: string; steps?: SiteStep[] };
  testimonials?: { heading?: string; items?: SiteTestimonial[] };
  cta?: { heading?: string; body?: string; primary?: SiteCta; secondary?: SiteCta };
  about?: { headline?: string; intro?: string; paragraphs?: string[]; imageUrl?: string; highlights?: SiteStep[] };
  theme?: {
    colors?: Partial<Record<"ink" | "inkHorizon" | "gold" | "acacia" | "sand" | "plum" | "sunset", string>>;
    headingFont?: "slab" | "sans" | "mono";
    bodyFont?: "slab" | "sans" | "mono";
  };
  navigation?: { links?: SiteCta[] };
  footer?: { columns?: Array<{ title: string; links: SiteCta[] }> };
  contact?: {
    email?: string;
    phone?: string;
    whatsapp?: string;
    address?: string;
    hours?: string;
    mapUrl?: string;
    social?: { facebook?: string; instagram?: string; x?: string; youtube?: string; tiktok?: string; linkedin?: string };
  };
}
export type SiteSection = keyof SiteContent;

export interface SiteIdentity {
  id: string;
  name: string;
  slug: string;
  status: string;
  customDomain: string | null;
  customDomainVerifiedAt: string | null;
}

export interface SiteAdminView {
  identity: SiteIdentity;
  /** Only what this tenant has overridden. */
  stored: SiteContent;
  /** What visitors see right now: defaults + stored. */
  effective: SiteContent;
  defaults: SiteContent;
  updatedAt: string | null;
}

export async function getSiteAdmin(token: string): Promise<SiteAdminView> {
  const { data } = await apiFetch<SiteAdminView>("/api/v1/admin/site", { token });
  return data;
}

/** Section-level save: a section replaces the stored one, `null` resets it to the defaults, omitted sections are untouched. */
export async function updateSiteContent(
  token: string,
  body: { [K in SiteSection]?: SiteContent[K] | null }
): Promise<SiteAdminView> {
  const { data } = await apiFetch<SiteAdminView>("/api/v1/admin/site/content", { method: "PATCH", token, body });
  return data;
}

export async function updateSiteIdentity(
  token: string,
  body: { name?: string; slug?: string; confirmSlugChange?: true }
): Promise<SiteIdentity> {
  const { data } = await apiFetch<SiteIdentity>("/api/v1/admin/site/identity", { method: "PATCH", token, body });
  return data;
}

// ------------------------------------------------------------------ hero video upload

/** Mirrors MAX_UPLOAD_BYTES_BY_CATEGORY.hero_video in @travel/validation (the server re-checks it). */
export const HERO_VIDEO_MAX_BYTES = 15 * 1024 * 1024;
export const HERO_VIDEO_TYPES = ["video/mp4", "video/webm"] as const;

interface UploadUrlResponse {
  uploadUrl: string;
  storageKey: string;
  requiredHeaders?: Record<string, string>;
  publicUrl: string;
}

/**
 * Uploads a hero background clip straight to storage (the file never passes through our API) and returns the
 * public https URL to put in `hero.videoUrls`. Two steps: ask the API for a short-lived signed upload URL, then
 * PUT the file to it. Throws an Error with a message fit to show the admin.
 */
export async function uploadHeroVideo(token: string, file: File, onProgress?: (fraction: number) => void): Promise<string> {
  if (!(HERO_VIDEO_TYPES as readonly string[]).includes(file.type)) throw new Error("Please choose an MP4 or WebM video.");
  if (file.size > HERO_VIDEO_MAX_BYTES) {
    throw new Error(`That file is ${(file.size / (1024 * 1024)).toFixed(1)}MB. The limit is ${HERO_VIDEO_MAX_BYTES / (1024 * 1024)}MB - trim it to 10-15 seconds and compress it.`);
  }

  const { data } = await apiFetch<UploadUrlResponse>("/api/v1/media/upload-url", {
    method: "POST",
    token,
    body: { category: "hero_video", fileName: file.name.slice(0, 255), contentType: file.type, sizeBytes: file.size },
  });

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", data.uploadUrl);
    for (const [k, v] of Object.entries(data.requiredHeaders ?? { "Content-Type": file.type })) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded / e.total);
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status}). Please try again.`)));
    xhr.onerror = () => reject(new Error("Upload failed - check your connection and try again."));
    xhr.send(file);
  });

  return data.publicUrl;
}
