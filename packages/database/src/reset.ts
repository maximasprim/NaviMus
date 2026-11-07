import "./load-env.js";
import { getTableName, is } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import postgres from "postgres";
import * as schema from "./schema/index.js";

/**
 * DEV/TEST ONLY. Wipes every row of every table this app defines (and resets
 * identity counters) so `pnpm db:seed` can run on a clean database.
 *
 *   pnpm --filter @travel/database db:reset --yes      # wipe only
 *   pnpm --filter @travel/database db:reseed           # wipe + seed
 *
 * It deletes ALL application data in the target database - not just the data
 * the seed created. Anything you added by hand (tenants, bookings, users...)
 * goes too. The schema (migrations) is left untouched, so there is no need to
 * re-run `db:migrate`.
 *
 * Safety rails:
 *   - refuses to run when NODE_ENV=production;
 *   - requires an explicit --yes flag (or RESET_CONFIRM=yes);
 *   - prints exactly which database it is about to wipe before doing it;
 *   - only touches tables defined in this app's Drizzle schema, so other
 *     schemas/tables in the same database (e.g. Supabase auth/storage, or the
 *     drizzle migrations table) are never truncated.
 *
 * Uses the OWNER connection (DATABASE_MIGRATION_URL, else DATABASE_URL):
 * the low-privilege `travel_app` role cannot TRUNCATE and is subject to RLS.
 */
async function main() {
  if (process.env.NODE_ENV === "production") {
    console.error("Refusing to reset a database while NODE_ENV=production.");
    process.exit(1);
  }

  const connectionString = process.env.DATABASE_MIGRATION_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_MIGRATION_URL (or DATABASE_URL) is required");
    process.exit(1);
  }

  const confirmed = process.argv.includes("--yes") || process.env.RESET_CONFIRM === "yes";
  const target = describeTarget(connectionString);

  const tables = (Object.values(schema) as unknown[])
    .filter((value): value is PgTable => is(value, PgTable))
    .map((table) => getTableName(table));
  const uniqueTables = [...new Set(tables)];

  console.log(`Target database: ${target}`);
  console.log(`This will DELETE ALL ROWS from ${uniqueTables.length} application tables.`);
  if (!confirmed) {
    console.error("Not confirmed. Re-run with --yes (or RESET_CONFIRM=yes) if you really want to wipe it.");
    process.exit(1);
  }

  const client = postgres(connectionString, { max: 1 });
  try {
    // One statement so Postgres resolves foreign-key order itself; CASCADE
    // covers any table that references these but isn't in the list.
    const list = uniqueTables.map((name) => `"public"."${name}"`).join(", ");
    await client.unsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
    const rows = await client<{ remaining: number }[]>`
      select (select count(*) from public.tenants)::int + (select count(*) from public.users)::int as remaining`;
    console.log(`Reset complete (tenants + users remaining: ${rows[0]?.remaining ?? "unknown"}).`);
  } finally {
    await client.end();
  }
}

/** host + database only - never the user or password. */
function describeTarget(connectionString: string): string {
  try {
    const url = new URL(connectionString);
    return `${url.hostname}${url.port ? `:${url.port}` : ""}${url.pathname}`;
  } catch {
    return "(unparseable connection string)";
  }
}

main().catch((err) => {
  console.error("Reset failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
