/**
 * Serialises structured data for embedding in <script type="application/ld+json">.
 *
 * Plain JSON.stringify is NOT safe there. The HTML parser ends a <script>
 * element at the first "</script", before any JavaScript/JSON rules apply, so
 * a package title like `</script><script>steal()</script>` - text a tour
 * operator controls - would close the tag and run attacker script on every
 * visitor's page (stored XSS). Escaping the characters that matter as \uXXXX
 * keeps the output valid JSON that parses back to exactly the same data, while
 * making it impossible for the markup parser to see a tag, a comment opener
 * ("<!--") or an entity. U+2028/2029 are escaped too: valid in JSON but line
 * terminators in older JavaScript parsers.
 */
export function safeJsonLd(data: unknown): string {
  const json = JSON.stringify(data);
  if (json === undefined) return "null";
  return json
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
