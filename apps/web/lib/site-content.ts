/**
 * Per-tenant public site content, as the STOREFRONT sees it.
 *
 * This file is client-safe (no next/headers) and holds three things:
 *  - the types of the content document (a mirror of packages/validation/src/site-content.ts),
 *  - DEFAULT_SITE_CONTENT: a verbatim copy of the text this storefront hard-coded before tenants could
 *    edit it. It is used (a) to fill in anything a tenant has not overridden and (b) as the fallback when
 *    the API is unreachable, so the site never renders blank. lib/site-content.test.ts fails if this
 *    copy ever drifts from the one the API serves (@travel/validation).
 *  - small render helpers: token filling and URL safety.
 *
 * Fetching lives in ./site-content-server.ts (it needs next/headers).
 */

import type { FooterColumn, NavLink, ThemeContent } from "./site-theme";

export interface Cta {
  label: string;
  href: string;
}
export interface Stat {
  value: string;
  label: string;
}
export interface Step {
  title: string;
  body: string;
}
export interface Testimonial {
  quote: string;
  name: string;
  trip?: string;
  photoUrl?: string;
}

export interface SiteContentDefaults {
  brand: { siteName: string; tagline: string; logoUrl: string; footerTagline: string; copyright: string };
  seo: { title: string; description: string; ogImageUrl: string };
  hero: {
    headline: string;
    subheadline: string;
    primaryCta: Cta;
    secondaryCta: Cta;
    stats: Stat[];
    routeStops: string[];
    videoUrls: string[];
  };
  stats: { items: Stat[] };
  sections: { destinationsHeading: string; destinationsIntro: string; packagesHeading: string; packagesIntro: string };
  howItWorks: { heading: string; intro: string; steps: Step[] };
  testimonials: { heading: string; items: Testimonial[] };
  cta: { heading: string; body: string; primary: Cta; secondary: Cta };
}

export interface AboutContent {
  headline?: string;
  intro?: string;
  paragraphs?: string[];
  imageUrl?: string;
  highlights?: Step[];
}
export interface ContactContent {
  email?: string;
  phone?: string;
  whatsapp?: string;
  address?: string;
  hours?: string;
  mapUrl?: string;
  social?: { facebook?: string; instagram?: string; x?: string; youtube?: string; tiktok?: string; linkedin?: string };
}

/** What the API may return: every section/field optional. */
export type SiteContent = { [K in keyof SiteContentDefaults]?: Partial<SiteContentDefaults[K]> } & {
  about?: AboutContent;
  contact?: ContactContent;
  theme?: ThemeContent;
  navigation?: { links?: NavLink[] };
  footer?: { columns?: FooterColumn[] };
};

/** After merging with the defaults: the default sections are complete; about/contact exist only if configured. */
export type ResolvedSiteContent = SiteContentDefaults & {
  about?: AboutContent;
  contact?: ContactContent;
  theme?: ThemeContent;
  navigation?: { links?: NavLink[] };
  footer?: { columns?: FooterColumn[] };
};

export const DEFAULT_SITE_CONTENT: SiteContentDefaults = {
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
};

function definedOnly<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null)) as Partial<T>;
}

/** defaults <- stored, one level deep; arrays are replaced wholesale ([] means "none"). Same rule as the API. */
export function mergeSiteContent(defaults: SiteContentDefaults, stored: SiteContent | null | undefined): ResolvedSiteContent {
  const result: Record<string, unknown> = {};
  const keys = new Set<string>([...Object.keys(defaults), ...Object.keys(stored ?? {})]);
  for (const key of keys) {
    const d = (defaults as unknown as Record<string, unknown>)[key];
    const s = (stored as Record<string, unknown> | null | undefined)?.[key];
    if (s === undefined || s === null) {
      if (d !== undefined) result[key] = d;
    } else if (d && typeof d === "object" && !Array.isArray(d) && typeof s === "object" && !Array.isArray(s)) {
      result[key] = { ...(d as object), ...definedOnly(s as object) };
    } else {
      result[key] = s;
    }
  }
  return result as unknown as ResolvedSiteContent;
}

/** Fills {siteName} and {year} in tenant-written text. */
export function fillTokens(value: string, ctx: { siteName: string; year?: number }): string {
  return value.replace(/\{siteName\}/g, ctx.siteName).replace(/\{year\}/g, String(ctx.year ?? new Date().getFullYear()));
}

/**
 * Fills {siteName} and {year} in EVERY text field of the document (so a tenant can use them anywhere),
 * except the site name itself. Pure: returns a new object.
 */
export function resolveSiteTokens(content: ResolvedSiteContent, year = new Date().getFullYear()): ResolvedSiteContent {
  const ctx = { siteName: content.brand.siteName, year };
  const walk = (value: unknown, path: string): unknown => {
    if (typeof value === "string") return path === "brand.siteName" ? value : fillTokens(value, ctx);
    if (Array.isArray(value)) return value.map((v) => walk(v, path));
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, walk(v, path ? `${path}.${k}` : k)]));
    }
    return value;
  };
  return walk(content, "") as ResolvedSiteContent;
}

// ----------------------------------------------------------------- URL safety
// The API already refuses anything but https:// and same-site paths. These repeat that check at render time
// so a bad value that reached the database some other way can never become a javascript:/data: link or image.

/** A same-site path or an https:// URL; anything else becomes "/". */
export function safeHref(href: string | undefined | null): string {
  if (!href) return "/";
  if (/^\/(?!\/)[^\s\\]*$/.test(href)) return href;
  return isHttps(href) ? href : "/";
}

/** An https:// URL, or "" (meaning: don't render it). */
export function safeImageUrl(url: string | undefined | null): string {
  return url && isHttps(url) ? url : "";
}

function isHttps(value: string): boolean {
  if (!value.startsWith("https://")) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

// ------------------------------------------------------------ section presence

export function isAboutConfigured(c: ResolvedSiteContent): boolean {
  const a = c.about;
  return Boolean(a && (a.headline || a.intro || a.paragraphs?.length || a.highlights?.length || a.imageUrl));
}

export function isContactConfigured(c: ResolvedSiteContent): boolean {
  const k = c.contact;
  if (!k) return false;
  return Boolean(k.email || k.phone || k.whatsapp || k.address || k.hours || k.mapUrl || Object.values(k.social ?? {}).some(Boolean));
}

/** The pages a visitor may navigate to, beyond the always-present ones. */
export function extraNavLinks(c: ResolvedSiteContent): Array<{ href: string; label: string }> {
  const links: Array<{ href: string; label: string }> = [];
  if (isAboutConfigured(c)) links.push({ href: "/about", label: "About" });
  if (isContactConfigured(c)) links.push({ href: "/contact", label: "Contact" });
  return links;
}

/** A phone number reduced to what `tel:` / wa.me links need. */
export function dialable(phone: string): string {
  return phone.replace(/[^\d+]/g, "");
}
