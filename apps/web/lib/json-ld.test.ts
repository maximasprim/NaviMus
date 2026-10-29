import { describe, expect, it } from "vitest";
import { safeJsonLd } from "./json-ld";

describe("safeJsonLd", () => {
  const hostile = {
    "@type": "TouristTrip",
    name: "</script><script>alert(document.cookie)</script>",
    description: "<!-- sneaky --> & <img src=x onerror=alert(1)>",
    nested: { list: ["</SCRIPT >", "a\u2028b\u2029c"] },
  };

  it("never emits a character the HTML parser could act on", () => {
    const out = safeJsonLd(hostile);
    expect(out).not.toMatch(/[<>&]/);
    expect(out.toLowerCase()).not.toContain("</script");
    expect(out).not.toContain("<!--");
    expect(out).not.toMatch(/[\u2028\u2029]/);
  });

  it("is still valid JSON that parses back to EXACTLY the original data", () => {
    expect(JSON.parse(safeJsonLd(hostile))).toEqual(hostile);
  });

  it("leaves ordinary data readable and unchanged", () => {
    const plain = { name: "3-Day Maasai Mara Safari", price: 450, tags: ["safari", "kenya"] };
    expect(safeJsonLd(plain)).toBe(JSON.stringify(plain));
  });

  it("does not throw on undefined (JSON.stringify returns undefined for it)", () => {
    expect(safeJsonLd(undefined)).toBe("null");
  });

  it("demonstrates the bug it fixes: plain JSON.stringify DOES contain a script terminator", () => {
    expect(JSON.stringify(hostile).toLowerCase()).toContain("</script");
  });
});
