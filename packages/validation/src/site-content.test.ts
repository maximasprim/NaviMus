import { describe, expect, it } from "vitest";
import {
  DEFAULT_FOOTER_COLUMNS,
  DEFAULT_NAV_LINKS,
  DEFAULT_SITE_CONTENT,
  THEME_DEFAULTS,
  RESERVED_SITE_SLUGS,
  fillSiteTokens,
  mergeSiteContent,
  siteContentSchema,
  siteSlugSchema,
  updateSiteContentSchema,
  updateSiteIdentitySchema,
} from "./site-content.js";

describe("site content: defaults", () => {
  it("the defaults themselves satisfy the schema (so an unconfigured tenant is always valid)", () => {
    expect(siteContentSchema.safeParse(DEFAULT_SITE_CONTENT).success).toBe(true);
  });

  it("an empty document is valid and merges to exactly the defaults", () => {
    expect(siteContentSchema.safeParse({}).success).toBe(true);
    expect(mergeSiteContent(DEFAULT_SITE_CONTENT, {})).toEqual(DEFAULT_SITE_CONTENT);
    expect(mergeSiteContent(DEFAULT_SITE_CONTENT, null)).toEqual(DEFAULT_SITE_CONTENT);
  });

  it("about and contact have NO defaults: they only appear once a tenant fills them in", () => {
    const merged = mergeSiteContent(DEFAULT_SITE_CONTENT, {});
    expect(merged.about).toBeUndefined();
    expect(merged.contact).toBeUndefined();
  });
});

describe("site content: merge", () => {
  it("a stored field overrides its default; untouched fields in the same section keep the default", () => {
    const merged = mergeSiteContent(DEFAULT_SITE_CONTENT, { brand: { siteName: "Acme Safaris" } });
    expect(merged.brand?.siteName).toBe("Acme Safaris");
    expect(merged.brand?.tagline).toBe(DEFAULT_SITE_CONTENT.brand.tagline);
    expect(merged.hero).toEqual(DEFAULT_SITE_CONTENT.hero);
  });

  it("arrays are replaced wholesale, and a stored empty array means 'none' (not 'fall back')", () => {
    const merged = mergeSiteContent(DEFAULT_SITE_CONTENT, { testimonials: { items: [] } });
    expect(merged.testimonials?.items).toEqual([]);
    expect(merged.testimonials?.heading).toBe(DEFAULT_SITE_CONTENT.testimonials.heading);
  });

  it("an explicitly empty string is kept (it hides the element), not treated as unset", () => {
    expect(mergeSiteContent(DEFAULT_SITE_CONTENT, { brand: { tagline: "" } }).brand?.tagline).toBe("");
  });

  it("sections with no default (about/contact) come through as stored", () => {
    const merged = mergeSiteContent(DEFAULT_SITE_CONTENT, { contact: { email: "hi@acme.test" } });
    expect(merged.contact).toEqual({ email: "hi@acme.test" });
  });
});

describe("site content: what a tenant may store", () => {
  const ok = (v: unknown) => siteContentSchema.safeParse(v).success;

  it("rejects non-https image and link URLs (no javascript:, data:, http:, protocol-relative)", () => {
    for (const bad of ["javascript:alert(1)", "data:text/html,x", "http://x.test/a.png", "//evil.test/a.png", "ftp://x.test/a.png"]) {
      expect(ok({ brand: { logoUrl: bad } }), `logoUrl ${bad}`).toBe(false);
      expect(ok({ hero: { primaryCta: { label: "Go", href: bad } } }), `href ${bad}`).toBe(false);
    }
    expect(ok({ brand: { logoUrl: "https://cdn.acme.test/logo.png" } })).toBe(true);
    expect(ok({ brand: { logoUrl: "" } })).toBe(true);
  });

  it("allows same-site paths and https links for call-to-action hrefs", () => {
    expect(ok({ cta: { primary: { label: "Browse", href: "/packages" } } })).toBe(true);
    expect(ok({ cta: { primary: { label: "Book", href: "https://acme.test/book" } } })).toBe(true);
    expect(ok({ cta: { primary: { label: "Bad", href: "/ /x" } } })).toBe(false);
  });

  it("rejects unknown keys at the top level, inside a section, and inside list items (no junk or smuggled fields)", () => {
    expect(ok({ nope: {} })).toBe(false);
    expect(ok({ brand: { siteName: "A", extra: 1 } })).toBe(false);
    expect(ok({ testimonials: { items: [{ quote: "q", name: "n", role: "x" }] } })).toBe(false);
  });

  it("enforces length and count limits", () => {
    expect(ok({ brand: { siteName: "x".repeat(81) } })).toBe(false);
    expect(ok({ brand: { siteName: "" } })).toBe(false); // a site must have a name; use unset instead
    expect(ok({ testimonials: { items: Array.from({ length: 13 }, () => ({ quote: "q", name: "n" })) } })).toBe(false);
    expect(ok({ hero: { routeStops: ["Only one"] } })).toBe(false);
    expect(ok({ hero: { routeStops: [] } })).toBe(true); // hides the map
    expect(ok({ about: { paragraphs: Array.from({ length: 13 }, () => "p") } })).toBe(false);
  });

  it("validates contact details", () => {
    expect(ok({ contact: { email: "not-an-email" } })).toBe(false);
    expect(ok({ contact: { email: "Hello@Acme.test", phone: "+254 700 000 000", whatsapp: "+254700000000" } })).toBe(true);
    expect(ok({ contact: { phone: "call me" } })).toBe(false);
    expect(ok({ contact: { social: { instagram: "http://insta.test/x" } } })).toBe(false);
    expect(ok({ contact: { social: { instagram: "https://instagram.com/acme" } } })).toBe(true);
  });

  it("stores markup-looking text as plain text without complaint (it is escaped at render, never executed)", () => {
    expect(ok({ about: { paragraphs: ["<script>alert(1)</script> We run safaris."] } })).toBe(true);
  });
});

describe("site content: PATCH body", () => {
  it("needs at least one section; null resets a section; unknown sections are rejected", () => {
    expect(updateSiteContentSchema.safeParse({}).success).toBe(false);
    expect(updateSiteContentSchema.safeParse({ hero: null }).success).toBe(true);
    expect(updateSiteContentSchema.safeParse({ brand: { siteName: "Acme" } }).success).toBe(true);
    expect(updateSiteContentSchema.safeParse({ branding: {} }).success).toBe(false);
  });
});

describe("site identity: slug", () => {
  const slug = (v: string) => siteSlugSchema.safeParse(v).success;

  it("accepts normal subdomain-safe slugs", () => {
    for (const s of ["acme", "acme-safaris", "kilimanjaro-treks-2", "a1b"]) expect(slug(s), s).toBe(true);
  });

  it("rejects malformed slugs", () => {
    for (const s of ["ab", "-acme", "acme-", "ac--me", "Acme", "acme_safaris", "acme safaris", "acme.com", "x".repeat(64), ""]) {
      expect(slug(s), JSON.stringify(s)).toBe(false);
    }
  });

  it("rejects every reserved platform name", () => {
    for (const s of RESERVED_SITE_SLUGS) if (/^[a-z0-9]+(-[a-z0-9]+)*$/.test(s) && s.length >= 3) expect(slug(s), s).toBe(false);
    expect(slug("admin")).toBe(false);
    expect(slug("www")).toBe(false);
  });

  it("a slug change needs explicit confirmation to be expressible, and an empty body is rejected", () => {
    expect(updateSiteIdentitySchema.safeParse({}).success).toBe(false);
    expect(updateSiteIdentitySchema.safeParse({ slug: "acme-safaris", confirmSlugChange: true }).success).toBe(true);
    expect(updateSiteIdentitySchema.safeParse({ slug: "acme-safaris", confirmSlugChange: false }).success).toBe(false);
    expect(updateSiteIdentitySchema.safeParse({ name: "Acme Travel Co" }).success).toBe(true);
  });
});

describe("tokens", () => {
  it("fills {siteName} and {year}, and leaves unknown tokens alone", () => {
    expect(fillSiteTokens("© {year} {siteName} - {other}", { siteName: "Acme", year: 2031 })).toBe("© 2031 Acme - {other}");
  });

  it("the default footer renders to exactly the legacy text for the default site name", () => {
    expect(fillSiteTokens(DEFAULT_SITE_CONTENT.brand.copyright, { siteName: "NaviMus", year: 2026 })).toBe(
      "© 2026 NaviMus Travel - demo build, not a real booking platform."
    );
    expect(fillSiteTokens(DEFAULT_SITE_CONTENT.seo.title, { siteName: "NaviMus" })).toBe("NaviMus - Multi-stop trips, booked properly");
  });
});

describe("site content: theme, navigation, footer", () => {
  it("are optional and absent from the defaults (unconfigured tenants are unchanged)", () => {
    expect(DEFAULT_SITE_CONTENT).not.toHaveProperty("theme");
    expect(DEFAULT_SITE_CONTENT).not.toHaveProperty("navigation");
    expect(DEFAULT_SITE_CONTENT).not.toHaveProperty("footer");
    const merged = mergeSiteContent(DEFAULT_SITE_CONTENT, {});
    expect(merged.theme).toBeUndefined();
  });

  it("accept good values and reject bad colours, fonts and links", () => {
    expect(siteContentSchema.safeParse({ theme: { colors: { gold: "#112233", sand: "" }, headingFont: "mono" } }).success).toBe(true);
    for (const bad of ["red", "#123", "#12345g", "url(x)", "#112233; x"]) {
      expect(siteContentSchema.safeParse({ theme: { colors: { gold: bad } } }).success, bad).toBe(false);
    }
    expect(siteContentSchema.safeParse({ theme: { headingFont: "comic" } }).success).toBe(false);
    expect(siteContentSchema.safeParse({ navigation: { links: [{ label: "Blog", href: "/blog" }] } }).success).toBe(true);
    expect(siteContentSchema.safeParse({ navigation: { links: [{ label: "x", href: "javascript:alert(1)" }] } }).success).toBe(false);
    expect(siteContentSchema.safeParse({ navigation: { links: Array.from({ length: 9 }, () => ({ label: "a", href: "/a" })) } }).success).toBe(false);
    expect(siteContentSchema.safeParse({ footer: { columns: [{ title: "T", links: [{ label: "a", href: "https://x.test" }] }] } }).success).toBe(true);
    expect(siteContentSchema.safeParse({ footer: { columns: Array.from({ length: 5 }, () => ({ title: "T", links: [] })) } }).success).toBe(false);
  });

  it("can be reset with null in a section update", () => {
    expect(updateSiteContentSchema.safeParse({ theme: null, navigation: null, footer: null }).success).toBe(true);
  });

  it("the built-in values satisfy their own schemas", () => {
    expect(siteContentSchema.safeParse({ theme: THEME_DEFAULTS, navigation: { links: DEFAULT_NAV_LINKS }, footer: { columns: DEFAULT_FOOTER_COLUMNS } }).success).toBe(true);
  });
});
