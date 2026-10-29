import argon2 from "argon2";

/**
 * Argon2id per the security requirements (bcrypt is the fallback
 * elsewhere, but argon2id is the stronger default for new code).
 */
export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, {
    type: argon2.argon2id,
    memoryCost: 19456, // ~19 MB, OWASP-recommended baseline
    timeCost: 2,
    parallelism: 1,
  });
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}
