import { describe, expect, it } from "vitest";
import * as api from "@travel/validation";
import {
  DEFAULT_SITE_CONTENT,
  dialable,
  extraNavLinks,
  fillTokens,
  isAboutConfigured,
  isContactConfigured,
  mergeSiteContent,
  resolveSiteTokens,
  safeHref,
  safeImageUrl,
  type SiteContent,
} from "./site-content";

describe("storefront fallback defaults", () => {
  it("are IDENTICAL to the defaults the API serves (@travel/validation) - fails if either copy is edited alone", () => {
    expect(DEFAULT_SITE_CONTENT).toEqual(api.DEFAULT_SITE_CONTENT);
  });

  it("merge the same way the API merges, for a spread of stored documents", () => {
    const docs: SiteContent[] = [
      {},
      { brand: { siteName: "Acme" } },
      { brand: { tagline: "" } },
      { testimonials: { items: [] } },
      { hero: { routeStops: [], stats: [{ value: "1", label: "One" }] } },
      { about: { headline: "Hi" }, contact: { email: "a@b.test" } },
      { cta: { primary: { label: "Go", href: "/x" } } },
    ];
    for (const doc of docs) {
      expect(mergeSiteContent(DEFAULT_SITE_CONTENT, doc), JSON.stringify(doc)).toEqual(
        api.mergeSiteContent(api.DEFAULT_SITE_CONTENT, doc as api.SiteContent)
      );
    }
  });
});

describe("what an unconfigured tenant renders (must equal the pre-feature storefront)", () => {
  const resolved = resolveSiteTokens(mergeSiteContent(DEFAULT_SITE_CONTENT, {}), 2026);

  it("keeps the exact legacy brand, footer and page-title text", () => {
    expect(resolved.brand.siteName).toBe("NaviMus");
    expect(resolved.brand.tagline).toBe("Trips & Trails");
    expect(resolved.brand.copyright).toBe("© 2026 NaviMus Travel - demo build, not a real booking platform.");
    expect(resolved.seo.title).toBe("NaviMus - Multi-stop trips, booked properly");
    expect(resolved.cta.body).toBe("Every package on NaviMus is priced up front - see what's included before you book anything.");
  });

  it("shows no About or Contact page, and links to neither", () => {
    expect(isAboutConfigured(resolved)).toBe(false);
    expect(isContactConfigured(resolved)).toBe(false);
    expect(extraNavLinks(resolved)).toEqual([]);
  });
});

describe("tokens", () => {
  it("resolve in every text field except the site name itself", () => {
    const merged = mergeSiteContent(DEFAULT_SITE_CONTENT, {
      brand: { siteName: "Acme Safaris" },
      about: { headline: "Welcome to {siteName}", paragraphs: ["Since {year}, {siteName}."] },
      testimonials: { heading: "Why {siteName}?" },
    });
    const r = resolveSiteTokens(merged, 2031);
    expect(r.about?.headline).toBe("Welcome to Acme Safaris");
    expect(r.about?.paragraphs).toEqual(["Since 2031, Acme Safaris."]);
    expect(r.testimonials.heading).toBe("Why Acme Safaris?");
    expect(r.brand.copyright).toBe("© 2031 Acme Safaris Travel - demo build, not a real booking platform.");
    expect(r.brand.siteName).toBe("Acme Safaris");
  });

  it("leave unknown tokens alone", () => {
    expect(fillTokens("{nope} {year}", { siteName: "A", year: 1999 })).toBe("{nope} 1999");
  });

  it("do not mutate their input", () => {
    const merged = mergeSiteContent(DEFAULT_SITE_CONTENT, {});
    const before = JSON.stringify(merged);
    resolveSiteTokens(merged, 2040);
    expect(JSON.stringify(merged)).toBe(before);
  });
});

describe("render-time URL safety (defence in depth behind the API's validation)", () => {
  it("only lets same-site paths and https links through as hrefs", () => {
    expect(safeHref("/packages")).toBe("/packages");
    expect(safeHref("https://acme.test/book")).toBe("https://acme.test/book");
    for (const bad of ["javascript:alert(1)", "data:text/html,x", "http://insecure.test", "//evil.test", "", undefined, "/ /x", "\\\\evil"]) {
      expect(safeHref(bad as string | undefined), String(bad)).toBe("/");
    }
  });

  it("only lets https through as an image/link URL, otherwise renders nothing", () => {
    expect(safeImageUrl("https://cdn.acme.test/a.png")).toBe("https://cdn.acme.test/a.png");
    for (const bad of ["http://x.test/a.png", "javascript:1", "data:image/png;base64,AAAA", "//x.test/a.png", "", undefined, null]) {
      expect(safeImageUrl(bad as string | null | undefined), String(bad)).toBe("");
    }
  });
});

describe("About / Contact appear only when filled in", () => {
  const withDefaults = (doc: SiteContent) => resolveSiteTokens(mergeSiteContent(DEFAULT_SITE_CONTENT, doc));

  it("About: any real content turns it on; an empty shell does not", () => {
    expect(isAboutConfigured(withDefaults({ about: {} }))).toBe(false);
    expect(isAboutConfigured(withDefaults({ about: { paragraphs: [] } }))).toBe(false);
    expect(isAboutConfigured(withDefaults({ about: { headline: "Our story" } }))).toBe(true);
    expect(isAboutConfigured(withDefaults({ about: { paragraphs: ["We began in 1999."] } }))).toBe(true);
  });

  it("Contact: any detail (including only a social link) turns it on; empty strings do not", () => {
    expect(isContactConfigured(withDefaults({ contact: {} }))).toBe(false);
    expect(isContactConfigured(withDefaults({ contact: { email: "", phone: "", social: { x: "" } } }))).toBe(false);
    expect(isContactConfigured(withDefaults({ contact: { email: "hi@acme.test" } }))).toBe(true);
    expect(isContactConfigured(withDefaults({ contact: { social: { instagram: "https://instagram.com/acme" } } }))).toBe(true);
  });

  it("nav links follow, in a stable order", () => {
    expect(extraNavLinks(withDefaults({ about: { headline: "x" }, contact: { email: "a@b.test" } }))).toEqual([
      { href: "/about", label: "About" },
      { href: "/contact", label: "Contact" },
    ]);
    expect(extraNavLinks(withDefaults({ contact: { phone: "+254700000000" } }))).toEqual([{ href: "/contact", label: "Contact" }]);
  });
});

describe("dialable", () => {
  it("reduces a formatted number to what tel:/wa.me need", () => {
    expect(dialable("+254 (700) 000-000")).toBe("+254700000000");
  });
});
