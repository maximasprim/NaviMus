import type { SiteContent, SiteSection } from "./site-api";

/**
 * Pure helpers behind the Site content editor: turning what the admin typed into the smallest correct
 * PATCH, and checking it before it is sent. No React, no network.
 */

// ------------------------------------------------------------------ equality

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a as object);
  const kb = Object.keys(b as object);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

// ------------------------------------------------------------- building payloads

function isBlank(v: unknown): boolean {
  if (v === undefined || v === null) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") return Object.values(v as object).every(isBlank);
  return false;
}

/** Trims strings and drops blank entries from lists, recursively. Keeps meaningful empty strings only where the caller asks. */
export function tidy<T>(value: T): T {
  if (typeof value === "string") return value.trim() as unknown as T;
  if (Array.isArray(value)) {
    return value.map((v) => tidy(v)).filter((v) => !isBlank(v)) as unknown as T;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, tidy(v)])) as T;
  }
  return value;
}

/**
 * For a section that HAS defaults: keep only the fields the admin actually changed. Fields left equal to
 * the default are omitted, so they keep following the platform's text. Returns null (= reset the section)
 * when nothing differs from the defaults.
 */
export function sectionFromDefaults<S extends object>(draft: S, defaults: S): Partial<S> | null {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(draft) as Array<keyof S & string>) {
    const value = tidy(draft[key]);
    if (!deepEqual(value, defaults[key])) out[key] = value;
  }
  return Object.keys(out).length === 0 ? null : (out as Partial<S>);
}

/** Recursively removes blank strings/lists/objects. */
export function prune<T>(value: T): T | undefined {
  if (typeof value === "string") return value.trim() === "" ? undefined : (value.trim() as unknown as T);
  if (Array.isArray(value)) {
    const items = value.map((v) => prune(v)).filter((v) => v !== undefined);
    return (items.length === 0 ? undefined : items) as unknown as T | undefined;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value)
      .map(([k, v]) => [k, prune(v)] as const)
      .filter(([, v]) => v !== undefined);
    return (entries.length === 0 ? undefined : Object.fromEntries(entries)) as T | undefined;
  }
  return value;
}

/** For a section with NO defaults (about, contact): keep what was filled in; clearing everything resets it (hides the page). */
export function sectionWithoutDefaults<S extends object>(draft: S): S | null {
  return (prune(draft) as S | undefined) ?? null;
}

// ----------------------------------------------------------------- validation
// Mirrors the backend's rules closely enough to catch mistakes before a round trip. The backend remains
// the authority: anything this lets through and the server rejects is still shown to the admin.

export function isHttpsUrl(v: string): boolean {
  if (!v.startsWith("https://")) return false;
  try {
    return new URL(v).protocol === "https:";
  } catch {
    return false;
  }
}

export function isLinkTarget(v: string): boolean {
  return /^\/(?!\/)[^\s\\]*$/.test(v) || isHttpsUrl(v);
}

export function isEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

export function isPhone(v: string): boolean {
  return /^\+?[0-9 ()-]{7,20}$/.test(v);
}

export const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export type Problems = string[];

export function checkUrl(problems: Problems, label: string, value: string | undefined) {
  if (value && !isHttpsUrl(value.trim())) problems.push(`${label} must be a full https:// link`);
}
export function checkHref(problems: Problems, label: string, value: string | undefined) {
  if (value && !isLinkTarget(value.trim())) problems.push(`${label} must be a path like /packages or a full https:// link`);
}

/** Sections that carry a payload, and the order they are saved in. */
export const SECTION_LABELS: Record<SiteSection, string> = {
  brand: "Brand",
  seo: "Search & sharing",
  hero: "Home hero",
  stats: "Stats bar",
  sections: "Section headings",
  howItWorks: "How it works",
  testimonials: "Testimonials",
  cta: "Call to action",
  about: "About",
  contact: "Contact",
  theme: "Colours & fonts",
  navigation: "Menu",
  footer: "Footer",
};

export type SectionPayload = { [K in SiteSection]?: SiteContent[K] | null };
