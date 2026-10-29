/**
 * Built-in look of the storefront, shown in the Colours & fonts editor as the "Default" and used to fill
 * the colour pickers. Mirrors packages/validation/src/site-content.ts (THEME_DEFAULTS etc.); the storefront
 * has a test that fails if its own copy drifts from the API's.
 */
export const THEME_COLORS = [
  { key: "inkHorizon", label: "Brand (dark)", hint: "Deep brand colour: headings, dark sections, footer.", fallback: "#0B322D" },
  { key: "gold", label: "Accent", hint: "Highlights, the route line, focus rings.", fallback: "#F2A93B" },
  { key: "acacia", label: "Links & hover", hint: "Links, hover colour, secondary accent.", fallback: "#0E9B7C" },
  { key: "sunset", label: "Call-to-action button", hint: "The \"Get started\" button.", fallback: "#F2543D" },
  { key: "sand", label: "Page background", hint: "The main page background.", fallback: "#FBF4E7" },
  { key: "ink", label: "Text", hint: "Main text colour.", fallback: "#231F1C" },
  { key: "plum", label: "Badges", hint: "Status badges and small accents.", fallback: "#7A3B63" },
] as const;
export type ThemeColorKey = (typeof THEME_COLORS)[number]["key"];

export const THEME_FONT_OPTIONS = [
  { value: "slab", label: "Slab serif (Zilla Slab) - the original headings" },
  { value: "sans", label: "Clean sans (Inter) - the original body text" },
  { value: "mono", label: "Monospace (IBM Plex Mono)" },
] as const;
export const DEFAULT_HEADING_FONT = "slab";
export const DEFAULT_BODY_FONT = "sans";

export const DEFAULT_NAV_LINKS = [
  { label: "Destinations", href: "/destinations" },
  { label: "Packages", href: "/packages" },
  { label: "My trips", href: "/bookings" },
];

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
];

export const HEX_RE = /^#[0-9a-fA-F]{6}$/;
