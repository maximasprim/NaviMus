import { z } from "zod";
import { emailSchema } from "./common.js";

/**
 * Per-tenant PUBLIC SITE CONTENT: everything a tenant admin can edit about their storefront
 * (site name, hero, stats, testimonials, story, contact, SEO, ...).
 *
 * Design rules - read before changing anything here:
 *
 *  1. EVERY section and field is optional. A tenant that has configured nothing renders exactly what
 *     the storefront rendered before this feature existed: DEFAULT_SITE_CONTENT below is a verbatim
 *     copy of that old hard-coded text. Stored content only ever overrides it.
 *
 *  2. Two sections have no defaults on purpose: `about` and `contact`. They are new pages, and a page
 *     with placeholder text is worse than no page. The storefront only shows them (nav link, footer
 *     link, route) once the tenant has actually filled them in.
 *
 *  3. Everything a tenant types is rendered as PLAIN TEXT by React (escaped), never as HTML. URLs are
 *     restricted to https:// (links may also be same-site paths) so a stored `javascript:` or
 *     `data:` URL can never reach an href/src. Do not loosen this without a security review.
 *
 *  4. Text may contain two tokens, filled in at render time: {siteName} and {year}.
 *
 *  5. The frontends do NOT import this package at runtime (it is built to dist and the apps only use
 *     it for nothing today). The storefront keeps its own fallback copy of the defaults
 *     (apps/web/lib/site-content.ts); a test in this repo fails if the two ever drift.
 */

// ---------------------------------------------------------------- primitives

const text = (max: number) => z.string().trim().max(max);
const requiredText = (max: number) => z.string().trim().min(1, "Required").max(max);

/** https:// only. An empty string is accepted and means "none". */
const httpsUrl = z
  .string()
  .trim()
  .max(500)
  .refine(
    (v) => {
      if (!v.startsWith("https://")) return false;
      try {
        return new URL(v).protocol === "https:";
      } catch {
        return false;
      }
    },
    { message: "Must be a full https:// link" }
  );
const optionalHttpsUrl = z.union([z.literal(""), httpsUrl]);

/** A same-site path ("/packages") or a full https:// link. Blocks javascript:, data:, protocol-relative //host, etc. */
const linkHref = z
  .string()
  .trim()
  .max(500)
  .refine(
    (v) => {
      if (/^\/(?!\/)[^\s\\]*$/.test(v)) return true;
      return httpsUrl.safeParse(v).success;
    },
    { message: "Use a path like /packages or a full https:// link" }
  );

const phone = z.union([z.literal(""), z.string().trim().regex(/^\+?[0-9 ()-]{7,20}$/, "Enter a valid phone number")]);
const optionalEmail = z.union([z.literal(""), emailSchema]);

const cta = z.object({ label: requiredText(40), href: linkHref }).strict();
const stat = z.object({ value: requiredText(12), label: requiredText(60) }).strict();

// ------------------------------------------------------------------ sections

export const brandSchema = z
  .object({
    /** What visitors see as the site's name (header, footer, page titles). */
    siteName: requiredText(80),
    tagline: text(80), // small line beside the name in the header; "" hides it
    logoUrl: optionalHttpsUrl, // "" = use the plain-text name
    footerTagline: text(160),
    copyright: text(240),
  })
  .partial()
  .strict();

export const seoSchema = z
  .object({
    title: text(70),
    description: text(200),
    ogImageUrl: optionalHttpsUrl,
  })
  .partial()
  .strict();

export const heroSchema = z
  .object({
    headline: requiredText(120), // a newline becomes a line break
    subheadline: text(300),
    primaryCta: cta,
    secondaryCta: cta,
    stats: z.array(stat).max(4),
    /** Stops drawn on the hero route map, in order. [] hides the map. */
    routeStops: z.array(requiredText(30)).max(6).refine((l) => l.length === 0 || l.length >= 2, "Use at least 2 stops, or none"),
    /** Background video clips (https). [] = the platform's built-in clips. */
    videoUrls: z.array(httpsUrl).max(7),
  })
  .partial()
  .strict();

export const statsSchema = z.object({ items: z.array(stat).max(6) }).partial().strict();

export const sectionsSchema = z
  .object({
    destinationsHeading: requiredText(100),
    destinationsIntro: text(200),
    packagesHeading: requiredText(100),
    packagesIntro: text(200),
  })
  .partial()
  .strict();

export const howItWorksSchema = z
  .object({
    heading: requiredText(100),
    intro: text(240),
    steps: z.array(z.object({ title: requiredText(60), body: requiredText(300) }).strict()).max(6),
  })
  .partial()
  .strict();

export const testimonialsSchema = z
  .object({
    heading: requiredText(100),
    items: z
      .array(
        z
          .object({
            quote: requiredText(500),
            name: requiredText(80),
            trip: text(100).optional(),
            photoUrl: optionalHttpsUrl.optional(),
          })
          .strict()
      )
      .max(12),
  })
  .partial()
  .strict();

export const ctaSchema = z
  .object({
    heading: requiredText(100),
    body: text(240),
    primary: cta,
    secondary: cta,
  })
  .partial()
  .strict();

export const aboutSchema = z
  .object({
    headline: requiredText(120),
    intro: text(400),
    /** The story, one entry per paragraph. */
    paragraphs: z.array(requiredText(2000)).max(12),
    imageUrl: optionalHttpsUrl,
    highlights: z.array(z.object({ title: requiredText(60), body: requiredText(300) }).strict()).max(6),
  })
  .partial()
  .strict();

export const socialSchema = z
  .object({
    facebook: optionalHttpsUrl,
    instagram: optionalHttpsUrl,
    x: optionalHttpsUrl,
    youtube: optionalHttpsUrl,
    tiktok: optionalHttpsUrl,
    linkedin: optionalHttpsUrl,
  })
  .partial()
  .strict();

export const contactSchema = z
  .object({
    email: optionalEmail,
    phone,
    whatsapp: phone,
    address: text(300),
    hours: text(300),
    mapUrl: optionalHttpsUrl,
    social: socialSchema,
  })
  .partial()
  .strict();

// ------------------------------------------- theme, navigation, footer (added later)
// Like `about`/`contact`, these three sections have NO entry in DEFAULT_SITE_CONTENT: absent means "render
// exactly what the storefront always rendered" (its built-in palette, fonts, menu and footer). They are
// additive - a tenant that never touches them is unaffected. Their built-in values are exported below
// (THEME_DEFAULTS, DEFAULT_NAV_LINKS, DEFAULT_FOOTER_COLUMNS) purely so the editors and the storefront
// can show/use them; a test keeps the storefront's copy identical.

/** A 6-digit hex colour, or "" meaning "use the built-in colour". Only this shape ever reaches a stylesheet. */
const hexColor = z.union([z.literal(""), z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, "Use a 6-digit colour like #0B322D")]);

/** The three typefaces the storefront ships with: a slab serif, a clean sans, and a monospace. */
export const THEME_FONTS = ["slab", "sans", "mono"] as const;
export type ThemeFont = (typeof THEME_FONTS)[number];

export const themeSchema = z
  .object({
    colors: z
      .object({
        ink: hexColor, // main text
        inkHorizon: hexColor, // deep brand colour: dark sections, headings, buttons
        gold: hexColor, // primary accent: highlights, main buttons, route line
        acacia: hexColor, // secondary accent: links, hover
        sand: hexColor, // page background
        plum: hexColor, // tertiary: badges
        sunset: hexColor, // energetic accent: the "Get started" button
      })
      .partial()
      .strict(),
    headingFont: z.enum(THEME_FONTS),
    bodyFont: z.enum(THEME_FONTS),
  })
  .partial()
  .strict();

export const navigationSchema = z.object({ links: z.array(cta).max(8) }).partial().strict();

export const footerSchema = z
  .object({
    columns: z.array(z.object({ title: requiredText(40), links: z.array(cta).max(8) }).strict()).max(4),
  })
  .partial()
  .strict();

export const siteContentSchema = z
  .object({
    brand: brandSchema,
    seo: seoSchema,
    hero: heroSchema,
    stats: statsSchema,
    sections: sectionsSchema,
    howItWorks: howItWorksSchema,
    testimonials: testimonialsSchema,
    cta: ctaSchema,
    about: aboutSchema,
    contact: contactSchema,
    theme: themeSchema,
    navigation: navigationSchema,
    footer: footerSchema,
  })
  .partial()
  .strict();

export type SiteContent = z.infer<typeof siteContentSchema>;

export const SITE_CONTENT_SECTIONS = [
  "brand",
  "seo",
  "hero",
  "stats",
  "sections",
  "howItWorks",
  "testimonials",
  "cta",
  "about",
  "contact",
  "theme",
  "navigation",
  "footer",
] as const;
export type SiteContentSection = (typeof SITE_CONTENT_SECTIONS)[number];

/**
 * PATCH body: provide only the sections being saved. A provided section REPLACES the stored one as a
 * whole; `null` resets that section back to the defaults; an omitted section is left untouched.
 * (Section-level, not field-level, so two admins editing different tabs never overwrite each other.)
 */
export const updateSiteContentSchema = z
  .object({
    brand: brandSchema.nullable(),
    seo: seoSchema.nullable(),
    hero: heroSchema.nullable(),
    stats: statsSchema.nullable(),
    sections: sectionsSchema.nullable(),
    howItWorks: howItWorksSchema.nullable(),
    testimonials: testimonialsSchema.nullable(),
    cta: ctaSchema.nullable(),
    about: aboutSchema.nullable(),
    contact: contactSchema.nullable(),
    theme: themeSchema.nullable(),
    navigation: navigationSchema.nullable(),
    footer: footerSchema.nullable(),
  })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, "Provide at least one section to update");
export type UpdateSiteContentInput = z.infer<typeof updateSiteContentSchema>;

// ------------------------------------------------------------------- identity

/**
 * A tenant's slug is its subdomain (slug.platform-domain) AND the key the gateway resolves tenants by,
 * so it cannot collide with anything the platform itself serves from a subdomain.
 */
export const RESERVED_SITE_SLUGS: readonly string[] = [
  "www", "api", "admin", "app", "apps", "partner", "partners", "portal", "platform", "signup", "billing",
  "support", "help", "mail", "smtp", "imap", "ftp", "static", "assets", "cdn", "media", "status", "docs",
  "blog", "web", "dashboard", "login", "register", "auth", "account", "root", "system", "internal",
  "staging", "dev", "test", "demo", "localhost", "webhooks", "health", "ready", "live",
];

export const siteSlugSchema = z
  .string()
  .trim()
  .min(3, "At least 3 characters")
  .max(63, "At most 63 characters")
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Lowercase letters, numbers, and single hyphens only")
  .refine((v) => !RESERVED_SITE_SLUGS.includes(v), "That address is reserved - choose another");

export const updateSiteIdentitySchema = z
  .object({
    /** Internal organisation name (admin console, emails). The public name lives in content.brand.siteName. */
    name: z.string().trim().min(2).max(200),
    slug: siteSlugSchema,
    /** Required whenever the slug actually changes: it moves the public address and the old one stops working. */
    confirmSlugChange: z.literal(true),
  })
  .partial()
  .strict()
  .refine((v) => v.name !== undefined || v.slug !== undefined, "Provide a name or a slug");
export type UpdateSiteIdentityInput = z.infer<typeof updateSiteIdentitySchema>;

// ------------------------------------------------------------------- defaults

/**
 * VERBATIM copy of what the storefront hard-coded before this feature (see apps/web/components/*).
 * Changing a value here changes what every unconfigured tenant sees - treat it as product copy.
 */
export const DEFAULT_SITE_CONTENT = {
  brand: {
    siteName: "NaviMus",
    tagline: "Trips & Trails",
    logoUrl: "",
    footerTagline: "Multi-stop trips, booked properly.",
    copyright: "© {year} {siteName} Travel - demo build, not a real booking platform.",
  },
  seo: {
    title: "{siteName} - Multi-stop trips, booked properly",
    description: "Discover destinations and book multi-stop travel packages with stays, transport, and transfers included.",
    ogImageUrl: "",
  },
  hero: {
    headline: "One booking.\nEvery stop covered.",
    subheadline: "Stays, transport, and transfers reserved together as one itinerary - priced up front, confirmed in one go.",
    primaryCta: { label: "Browse packages", href: "/packages" },
    secondaryCta: { label: "Explore destinations", href: "/destinations" },
    stats: [
      { value: "15+", label: "Years planning trips" },
      { value: "40+", label: "Ready-made itineraries" },
      { value: "24/7", label: "Traveler support" },
    ],
    routeStops: ["Nairobi", "Naivasha", "Amboseli", "Masai Mara"],
    videoUrls: [],
  },
  stats: {
    items: [
      { value: "40+", label: "Curated itineraries" },
      { value: "15+", label: "Years in travel planning" },
      { value: "98%", label: "Trips confirmed on first quote" },
      { value: "24/7", label: "Support while you travel" },
    ],
  },
  sections: {
    destinationsHeading: "Destinations worth the detour",
    destinationsIntro: "Hand-picked stops that anchor our most-booked routes.",
    packagesHeading: "Complete packages, priced up front",
    packagesIntro: "Every fare below includes stays, transport, and transfers.",
  },
  howItWorks: {
    heading: "Booking a multi-stop trip, simplified",
    intro: "Four steps stand between browsing and boarding - no separate bookings to reconcile.",
    steps: [
      {
        title: "Pick a route",
        body: "Browse complete itineraries or start from a single destination - each one shows exactly what's included.",
      },
      {
        title: "Check the real price",
        body: "Add your travel dates and group size for a live quote. No placeholder pricing, no surprise fees at checkout.",
      },
      {
        title: "Book in one step",
        body: "Stays, transport, and transfers are reserved together, confirmed the moment payment clears.",
      },
      {
        title: "Travel with support",
        body: "Your itinerary and booking reference travel with you - reach support any time before or during the trip.",
      },
    ],
  },
  testimonials: {
    heading: "What travelers say after they're back",
    items: [
      {
        quote:
          "We booked stays, the transfer from the airport, and a Mara game drive in one go. Nothing to chase up separately once we landed.",
        name: "Amara O.",
        trip: "9-day Kenya loop",
      },
      {
        quote:
          "The itinerary listed exactly what was included before we paid anything. Checkout matched the quote to the shilling.",
        name: "Brian K.",
        trip: "Diani beach week",
      },
      {
        quote:
          "Our connecting stop got rebooked without us noticing a thing when a transfer time changed. That's the part we'd pay for again.",
        name: "Grace W.",
        trip: "Naivasha–Amboseli–Mara route",
      },
    ],
  },
  cta: {
    heading: "Ready to plan the next trip?",
    body: "Every package on {siteName} is priced up front - see what's included before you book anything.",
    primary: { label: "Browse packages", href: "/packages" },
    secondary: { label: "List your business", href: "/business-signup" },
  },
  // `about` and `contact` intentionally absent - see rule 2 at the top of this file.
} satisfies SiteContent;

/**
 * Built-in values of the sections that have no entry in DEFAULT_SITE_CONTENT. What the storefront rendered
 * before tenants could change them; used when a tenant has not set them.
 */
export const THEME_DEFAULTS = {
  colors: {
    ink: "#231F1C",
    inkHorizon: "#0B322D",
    gold: "#F2A93B",
    acacia: "#0E9B7C",
    sand: "#FBF4E7",
    plum: "#7A3B63",
    sunset: "#F2543D",
  },
  headingFont: "slab",
  bodyFont: "sans",
} as const;

export const DEFAULT_NAV_LINKS = [
  { label: "Destinations", href: "/destinations" },
  { label: "Packages", href: "/packages" },
  { label: "My trips", href: "/bookings" },
] as const;

export const DEFAULT_FOOTER_COLUMNS = [
  {
    title: "Explore",
    links: [
      { label: "Destinations", href: "/destinations" },
      { label: "Packages", href: "/packages" },
      { label: "My trips", href: "/bookings" },
    ],
  },
  {
    title: "Account",
    links: [
      { label: "Sign in", href: "/login" },
      { label: "Create account", href: "/register" },
    ],
  },
  { title: "Company", links: [{ label: "List your business", href: "/business-signup" }] },
] as const;

// ---------------------------------------------------------------------- merge

function definedOnly<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}

/**
 * defaults <- stored, one level deep: each stored FIELD overrides the default field; arrays are replaced
 * wholesale (a stored `[]` means "none", not "fall back"); a stored section with no default is used as is.
 */
export function mergeSiteContent(defaults: SiteContent, stored: SiteContent | null | undefined): SiteContent {
  const result: Record<string, unknown> = {};
  const keys = new Set<string>([...Object.keys(defaults), ...Object.keys(stored ?? {})]);
  for (const key of keys) {
    const d = (defaults as Record<string, unknown>)[key];
    const s = (stored as Record<string, unknown> | null | undefined)?.[key];
    if (s === undefined || s === null) {
      if (d !== undefined) result[key] = d;
    } else if (d && typeof d === "object" && !Array.isArray(d) && typeof s === "object" && !Array.isArray(s)) {
      result[key] = { ...(d as object), ...definedOnly(s as object) };
    } else {
      result[key] = s;
    }
  }
  return result as SiteContent;
}

/** Fills {siteName} and {year} in tenant-written text. Unknown tokens are left as typed. */
export function fillSiteTokens(value: string, ctx: { siteName: string; year?: number }): string {
  const year = String(ctx.year ?? new Date().getFullYear());
  return value.replace(/\{siteName\}/g, ctx.siteName).replace(/\{year\}/g, year);
}
