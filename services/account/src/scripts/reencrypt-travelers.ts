/**
 * Re-encrypts every stored passport number under the CURRENT
 * ENCRYPTION_KEY. Part of the key-rotation procedure:
 *
 *   1. pnpm secrets:generate            -> new ENCRYPTION_KEY
 *   2. set ENCRYPTION_KEY_PREVIOUS=<old key>, ENCRYPTION_KEY=<new key>, deploy
 *      (decryption falls back to the previous key, so nothing breaks)
 *   3. pnpm --filter @travel/service-account reencrypt            (dry run)
 *      pnpm --filter @travel/service-account reencrypt -- --apply (do it)
 *   4. remove ENCRYPTION_KEY_PREVIOUS and redeploy
 *
 * Dry-run by default. Each row is decrypted before it is rewritten, so a
 * value that can't be decrypted under EITHER key is reported and left
 * untouched rather than overwritten with garbage.
 */
import { env } from "@travel/config";
import { createDb, eq, isNotNull, schema, withPlatformRLSBypass } from "@travel/database";
import { decryptField, encryptField, needsReencryption } from "@travel/auth";

const apply = process.argv.includes("--apply");

async function main() {
  if (!env.ENCRYPTION_KEY) throw new Error("ENCRYPTION_KEY is not set");
  const db = createDb(env.DATABASE_URL);

  const counts = { total: 0, alreadyCurrent: 0, migrated: 0, undecryptable: 0 };

  await withPlatformRLSBypass(db, async (tx) => {
    const rows = await tx
      .select({ id: schema.travelers.id, value: schema.travelers.passportNumberEncrypted })
      .from(schema.travelers)
      .where(isNotNull(schema.travelers.passportNumberEncrypted));

    for (const row of rows) {
      counts.total++;
      const stored = row.value!;
      if (!needsReencryption(stored)) {
        counts.alreadyCurrent++;
        continue;
      }
      let plaintext: string;
      try {
        plaintext = decryptField(stored);
      } catch {
        counts.undecryptable++;
        console.error(`! traveler ${row.id}: cannot be decrypted with current or previous key - left untouched`);
        continue;
      }
      if (apply) {
        await tx
          .update(schema.travelers)
          .set({ passportNumberEncrypted: encryptField(plaintext) })
          .where(eq(schema.travelers.id, row.id));
      }
      counts.migrated++;
    }
  });

  console.log(apply ? "APPLIED" : "DRY RUN (pass --apply to write)", counts);
  if (counts.undecryptable > 0) process.exitCode = 1;
  process.exit(process.exitCode ?? 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
