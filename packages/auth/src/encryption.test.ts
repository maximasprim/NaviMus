import { createCipheriv, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptField, encryptField, needsReencryption } from "./encryption.js";

// Matches vitest.config.ts: current key = 0x11.., previous key = 0x22..
const OLD_KEY = Buffer.from("22".repeat(32), "hex");
const UNRELATED_KEY = Buffer.from("33".repeat(32), "hex");

/** Produces ciphertext in the production format under an arbitrary key. */
function encryptUnder(key: Buffer, plaintext: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([c.update(plaintext, "utf8"), c.final()]);
  return `${iv.toString("hex")}:${c.getAuthTag().toString("hex")}:${ct.toString("hex")}`;
}

describe("field encryption", () => {
  it("round-trips and never stores plaintext", () => {
    const stored = encryptField("A1234567");
    expect(stored).not.toContain("A1234567");
    expect(decryptField(stored)).toBe("A1234567");
    expect(needsReencryption(stored)).toBe(false);
  });

  it("uses a fresh IV every time", () => {
    expect(encryptField("same")).not.toBe(encryptField("same"));
  });

  it("still decrypts data written under the PREVIOUS key (safe key rotation)", () => {
    const legacy = encryptUnder(OLD_KEY, "P9876543");
    expect(decryptField(legacy)).toBe("P9876543");
    expect(needsReencryption(legacy)).toBe(true);
  });

  it("re-encrypting legacy data moves it onto the current key", () => {
    const legacy = encryptUnder(OLD_KEY, "P9876543");
    const migrated = encryptField(decryptField(legacy));
    expect(needsReencryption(migrated)).toBe(false);
    expect(decryptField(migrated)).toBe("P9876543");
  });

  it("rejects data encrypted under an unrelated key", () => {
    expect(() => decryptField(encryptUnder(UNRELATED_KEY, "x"))).toThrow();
  });

  it("detects tampering (GCM authentication)", () => {
    const [iv, tag, ct] = encryptField("A1234567").split(":");
    const flipped = ct!.slice(0, -1) + (ct!.endsWith("0") ? "1" : "0");
    expect(() => decryptField(`${iv}:${tag}:${flipped}`)).toThrow();
  });

  it("rejects malformed input without trying the fallback key", () => {
    expect(() => decryptField("not-a-valid-value")).toThrow(/Malformed/);
  });
});
