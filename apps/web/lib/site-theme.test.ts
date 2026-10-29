import { describe, expect, it } from "vitest";
import * as api from "@travel/validation";
import { safeHref } from "./site-content";
import {
  DEFAULT_FOOTER_COLUMNS,
  DEFAULT_NAV_LINKS,
  THEME_DEFAULTS,
  buildThemeCss,
  darken,
  lighten,
  resolveFooterColumns,
  resolveNavLinks,
} from "./site-theme";

describe("storefront theme/menu/footer built-ins", () => {
  it("are IDENTICAL to the ones the API package exports - fails if either copy is edited alone", () => {
    expect(THEME_DEFAULTS).toEqual(api.THEME_DEFAULTS);
    expect(DEFAULT_NAV_LINKS).toEqual(api.DEFAULT_NAV_LINKS);
    expect(DEFAULT_FOOTER_COLUMNS).toEqual(api.DEFAULT_FOOTER_COLUMNS);
  });
});

describe("unconfigured tenants render as before", () => {
  it("injects no CSS", () => {
    expect(buildThemeCss(undefined)).toBe("");
    expect(buildThemeCss({})).toBe("");
    expect(buildThemeCss({ colors: {} })).toBe("");
    expect(buildThemeCss({ colors: { gold: "" } })).toBe("");
  });
  it("keeps the built-in menu and footer", () => {
    expect(resolveNavLinks(undefined, safeHref)).toEqual(DEFAULT_NAV_LINKS);
    expect(resolveFooterColumns(undefined, safeHref)).toEqual(DEFAULT_FOOTER_COLUMNS);
  });
});

describe("configured tenants", () => {
  it("emits only validated colours and known fonts", () => {
    const css = buildThemeCss({ colors: { gold: "#112233", acacia: "red; } body{display:none" as string }, headingFont: "mono" });
    expect(css).toContain("--c-gold:17 34 51");
    expect(css).not.toContain("display:none");
    expect(css).not.toContain("--c-acacia");
    expect(css).toContain("--ff-display:var(--font-plex-mono)");
    expect(buildThemeCss({ bodyFont: "evil" as never })).toBe("");
  });
  it("derives soft/deep shades from the chosen colour", () => {
    expect(buildThemeCss({ colors: { gold: "#F2A93B" } })).toMatch(/--c-gold-soft:.*--c-gold-deep:/);
    expect(lighten("#000000", 0.5)).toBe("#808080");
    expect(darken("#ffffff", 0.5)).toBe("#808080");
  });
  it("uses the tenant's menu exactly ([] = no links) and sanitises hrefs", () => {
    expect(resolveNavLinks([], safeHref)).toEqual([]);
    expect(resolveNavLinks([{ label: "Blog", href: "javascript:alert(1)" }], safeHref)).toEqual([{ label: "Blog", href: "/" }]);
  });
  it("drops footer columns with no links", () => {
    const cols = resolveFooterColumns([{ title: "A", links: [] }, { title: "B", links: [{ label: "x", href: "/x" }] }], safeHref);
    expect(cols).toEqual([{ title: "B", links: [{ label: "x", href: "/x" }] }]);
  });
});
