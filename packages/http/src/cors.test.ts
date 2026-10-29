import { describe, expect, it } from "vitest";
import { parseAllowedOrigins, resolveCorsOrigin } from "./cors.js";

const prod = { production: true };
const dev = { production: false };
const allow = parseAllowedOrigins("https://app.example.com, https://*.example.com/ ,http://localhost:3000");

describe("parseAllowedOrigins", () => {
  it("splits, trims, drops trailing slashes and blanks", () => {
    expect(parseAllowedOrigins(" https://a.test/ , ,https://b.test")).toEqual(["https://a.test", "https://b.test"]);
    expect(parseAllowedOrigins(undefined)).toEqual([]);
    expect(parseAllowedOrigins("")).toEqual([]);
  });
});

describe("resolveCorsOrigin", () => {
  it("echoes an exactly listed origin", () => {
    expect(resolveCorsOrigin("https://app.example.com", allow, prod)).toBe("https://app.example.com");
  });

  it("never returns '*' and never reflects an unlisted origin", () => {
    expect(resolveCorsOrigin("https://evil.test", allow, prod)).toBeNull();
    expect(resolveCorsOrigin("https://evil.test", [], prod)).toBeNull();
    expect(resolveCorsOrigin(undefined, allow, prod)).toBeNull();
  });

  it("wildcard allows real tenant subdomains, including nested ones", () => {
    expect(resolveCorsOrigin("https://acme.example.com", allow, prod)).toBe("https://acme.example.com");
    expect(resolveCorsOrigin("https://a.b.example.com", allow, prod)).toBe("https://a.b.example.com");
  });

  it.each([
    "https://example.com", // the bare domain is not a subdomain
    "https://evil-example.com", // suffix trick without the dot
    "https://example.com.evil.test", // allowed domain as a prefix
    "http://acme.example.com", // scheme must match
    "https://.example.com", // empty label
    "not a url",
  ])("wildcard refuses %s", (origin) => {
    expect(resolveCorsOrigin(origin, parseAllowedOrigins("https://*.example.com"), prod)).toBeNull();
  });

  it("matches the port when the pattern pins one", () => {
    const a = parseAllowedOrigins("http://localhost:3000");
    expect(resolveCorsOrigin("http://localhost:3000", a, dev)).toBe("http://localhost:3000");
    expect(resolveCorsOrigin("http://localhost:3001", a, dev)).toBeNull();
  });

  it("with nothing configured: dev allows loopback only; production allows nothing", () => {
    expect(resolveCorsOrigin("http://localhost:3000", [], dev)).toBe("http://localhost:3000");
    expect(resolveCorsOrigin("http://127.0.0.1:5173", [], dev)).toBe("http://127.0.0.1:5173");
    expect(resolveCorsOrigin("https://example.com", [], dev)).toBeNull();
    expect(resolveCorsOrigin("http://localhost:3000", [], prod)).toBeNull();
  });

  it("an explicit allowlist in dev disables the loopback convenience (what you configure is what you get)", () => {
    expect(resolveCorsOrigin("http://localhost:9999", parseAllowedOrigins("https://app.example.com"), dev)).toBeNull();
  });
});
