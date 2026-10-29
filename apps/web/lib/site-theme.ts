/**
 * Per-tenant theme, navigation and footer - STOREFRONT side. Client-safe (no next/headers).
 *
 * Nothing here changes what an unconfigured tenant sees: the built-in palette/fonts live in globals.css as
 * CSS variables with the original values, and `buildThemeCss` returns "" when a tenant has set nothing.
 * Only values that pass the strict 6-digit-hex check ever reach a stylesheet, and font choices are mapped
 * from a closed list, so tenant input can never inject CSS.
 *
 * THEME_DEFAULTS / DEFAULT_NAV_LINKS / DEFAULT_FOOTER_COLUMNS mirror @travel/validation; site-theme.test.ts
 * fails if the two copies drift.
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

export type ThemeFont = "slab" | "sans" | "mono";
export type ThemeColorKey = keyof typeof THEME_DEFAULTS.colors;

export interface ThemeContent {
  colors?: Partial<Record<ThemeColorKey, string>>;
  headingFont?: ThemeFont;
  bodyFont?: ThemeFont;
}
export interface NavLink {
  label: string;
  href: string;
}
export interface FooterColumn {
  title: string;
  links: NavLink[];
}

// ------------------------------------------------------------------ colours

const HEX = /^#[0-9a-fA-F]{6}$/;

function rgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}
function channels(hex: string): string {
  return rgb(hex).join(" ");
}
function toHex([r, g, b]: number[]): string {
  return "#" + [r, g, b].map((n) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, "0")).join("");
}
/** Mixes `hex` toward `target` by `amount` (0..1). */
export function mix(hex: string, target: [number, number, number], amount: number): string {
  const c = rgb(hex);
  return toHex(c.map((v, i) => v + (target[i] - v) * amount));
}
const WHITE: [number, number, number] = [255, 255, 255];
const BLACK: [number, number, number] = [0, 0, 0];
export const lighten = (hex: string, amount: number) => mix(hex, WHITE, amount);
export const darken = (hex: string, amount: number) => mix(hex, BLACK, amount);

function valid(value: string | undefined): string | null {
  return value && HEX.test(value) ? value : null;
}

const FONT_STACKS: Record<ThemeFont, string> = {
  slab: "var(--font-zilla), Georgia, serif",
  sans: "var(--font-inter), system-ui, sans-serif",
  mono: "var(--font-plex-mono), ui-monospace, monospace",
};

/**
 * CSS custom-property overrides for the tenant's theme, or "" when nothing is customised (then the
 * defaults in globals.css apply untouched). The "soft"/"deep"/"light"/"dark" shades are derived from the
 * colour the tenant picked, so choosing one colour re-tones its whole family.
 */
export function buildThemeCss(theme: ThemeContent | null | undefined): string {
  if (!theme) return "";
  const c = theme.colors ?? {};
  const decl: string[] = [];
  const set = (name: string, hex: string) => decl.push(`--c-${name}:${channels(hex)}`);

  const ink = valid(c.ink);
  if (ink) set("ink", ink);

  const horizon = valid(c.inkHorizon);
  if (horizon) {
    set("ink-horizon", horizon);
    set("ink-horizon-deep", darken(horizon, 0.25));
    set("ink-horizon-mid", lighten(horizon, 0.1));
    set("ink-horizon-end", lighten(horizon, 0.14));
  }
  const gold = valid(c.gold);
  if (gold) {
    set("gold", gold);
    set("gold-soft", lighten(gold, 0.45));
    set("gold-deep", darken(gold, 0.17));
  }
  const acacia = valid(c.acacia);
  if (acacia) {
    set("acacia", acacia);
    set("acacia-soft", lighten(acacia, 0.4));
  }
  const sand = valid(c.sand);
  if (sand) {
    set("sand", sand);
    set("sand-light", lighten(sand, 0.6));
    set("sand-dark", darken(sand, 0.06));
  }
  const plum = valid(c.plum);
  if (plum) {
    set("plum", plum);
    set("plum-soft", lighten(plum, 0.3));
  }
  const sunset = valid(c.sunset);
  if (sunset) {
    set("sunset", sunset);
    set("sunset-soft", lighten(sunset, 0.45));
  }

  if (theme.headingFont && theme.headingFont in FONT_STACKS) decl.push(`--ff-display:${FONT_STACKS[theme.headingFont]}`);
  if (theme.bodyFont && theme.bodyFont in FONT_STACKS) decl.push(`--ff-body:${FONT_STACKS[theme.bodyFont]}`);

  return decl.length ? `:root{${decl.join(";")}}` : "";
}

// ------------------------------------------------------- navigation & footer

function cleanLinks(links: NavLink[], safeHref: (h: string) => string): NavLink[] {
  return links.filter((l) => l.label.trim()).map((l) => ({ label: l.label, href: safeHref(l.href) }));
}

/**
 * Header menu. Not configured -> the built-in three links. Configured -> exactly the tenant's list
 * ([] means "no menu links"). About/Contact links are appended by the caller either way.
 */
export function resolveNavLinks(configured: NavLink[] | undefined, safeHref: (h: string) => string): NavLink[] {
  if (!configured) return DEFAULT_NAV_LINKS.map((l) => ({ ...l }));
  return cleanLinks(configured, safeHref);
}

/** Footer link columns. Not configured -> the built-in three columns. Columns with no links are dropped. */
export function resolveFooterColumns(configured: FooterColumn[] | undefined, safeHref: (h: string) => string): FooterColumn[] {
  if (!configured) return DEFAULT_FOOTER_COLUMNS.map((c) => ({ title: c.title, links: c.links.map((l) => ({ ...l })) }));
  return configured
    .map((col) => ({ title: col.title, links: cleanLinks(col.links, safeHref) }))
    .filter((col) => col.links.length > 0);
}
