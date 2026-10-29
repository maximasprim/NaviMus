import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "@travel/config";

/**
 * Section 19/33: "Sensitive personal information must be encrypted
 * or protected appropriately" / "Encryption for sensitive data".
 * AES-256-GCM (authenticated - tampering with the ciphertext is
 * detected, not just silently decrypted to garbage). Currently used
 * for `travelers.passport_number_encrypted` only; the same two
 * functions cover any other field that needs this later.
 *
 * Output format: `{ivHex}:{authTagHex}:{ciphertextHex}` - a single
 * string so it fits in one `text` column without a second column for
 * the IV.
 *
 * Deliberately does NOT read `ENCRYPTION_KEY` at module load - it's
 * optional in @travel/config so services that never touch encrypted
 * fields aren't forced to configure a key they don't need. The clear
 * failure happens here, at first actual use, not as a silent no-op.
 */
function getKey(): Buffer {
  if (!env.ENCRYPTION_KEY) {
    throw new Error(
      "ENCRYPTION_KEY is not configured - required before encrypting/decrypting sensitive fields like passport numbers"
    );
  }
  return Buffer.from(env.ENCRYPTION_KEY, "hex");
}

export function encryptField(plaintext: string): string {
  const iv = randomBytes(12); // 96-bit IV, standard for GCM
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

function previousKey(): Buffer | null {
  return env.ENCRYPTION_KEY_PREVIOUS ? Buffer.from(env.ENCRYPTION_KEY_PREVIOUS, "hex") : null;
}

function decryptWith(key: Buffer, stored: string): string {
  const [ivHex, authTagHex, ciphertextHex] = stored.split(":");
  if (!ivHex || !authTagHex || !ciphertextHex) {
    throw new Error("Malformed encrypted field value");
  }
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextHex, "hex")), decipher.final()]).toString("utf8");
}

/**
 * Decrypts with the current key, falling back to ENCRYPTION_KEY_PREVIOUS
 * if (and only if) the current key fails GCM authentication. That
 * fallback is what makes key rotation safe: without it, replacing a
 * leaked ENCRYPTION_KEY would instantly make every stored passport
 * number undecryptable. A malformed value still throws immediately.
 */
export function decryptField(stored: string): string {
  try {
    return decryptWith(getKey(), stored);
  } catch (err) {
    const prev = previousKey();
    if (!prev || (err instanceof Error && err.message === "Malformed encrypted field value")) throw err;
    return decryptWith(prev, stored);
  }
}

/** True when `stored` only decrypts under the previous key, i.e. it still needs re-encrypting. */
export function needsReencryption(stored: string): boolean {
  try {
    decryptWith(getKey(), stored);
    return false;
  } catch {
    return true;
  }
}
