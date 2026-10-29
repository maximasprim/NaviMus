import "./load-env.js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

/**
 * Standalone migration runner - invoked by `pnpm db:migrate` or a
 * CI/CD deploy step. Never run migrations from application boot
 * code (rule #6: never manually/implicitly modify production
 * schemas outside a controlled migration step).
 */
async function main() {
  // Migrations must run as the schema OWNER, not as the low-privilege
  // `travel_app` role the API uses at runtime (that role is subject to
  // row-level security and has no DDL rights). Falls back to DATABASE_URL
  // for simple single-role setups.
  const connectionString = process.env.DATABASE_MIGRATION_URL ?? process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_MIGRATION_URL (or DATABASE_URL) is required to run migrations");
    process.exit(1);
  }

  const migrationClient = postgres(connectionString, { max: 1 });
  const db = drizzle(migrationClient);

  console.log("Running migrations...");
  await migrate(db, { migrationsFolder: "./src/migrations" });
  console.log("Migrations complete.");

  await migrationClient.end();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
