import "./load-env.js";
import postgres from "postgres";

/**
 * Gives the `travel_app` role (created NOLOGIN by migration 0002) a login
 * password, so no password ever lives in a migration or in git.
 *
 *   APP_DB_PASSWORD='<strong secret>' pnpm --filter @travel/database db:setup-app-role
 *
 * Run as the OWNER role (DATABASE_MIGRATION_URL). Safe to re-run - that is
 * also how you rotate the password. Prints the DATABASE_URL shape to use
 * (with the password redacted).
 */
async function main() {
  const adminUrl = process.env.DATABASE_MIGRATION_URL ?? process.env.DATABASE_URL;
  const password = process.env.APP_DB_PASSWORD;
  if (!adminUrl) throw new Error("DATABASE_MIGRATION_URL (or DATABASE_URL) is required");
  if (!password || password.length < 16) {
    throw new Error("APP_DB_PASSWORD is required and must be at least 16 characters");
  }

  const client = postgres(adminUrl, { max: 1 });
  try {
    const [role] = await client`select 1 from pg_roles where rolname = 'travel_app'`;
    if (!role) throw new Error("Role travel_app does not exist - run `pnpm db:migrate` first");

    // ALTER ROLE cannot take bind parameters, so let Postgres quote the literal.
    const [row] = await client`select format('ALTER ROLE travel_app LOGIN PASSWORD %L', ${password}::text) as stmt`;
    await client.unsafe(String(row?.stmt));

    const u = new URL(adminUrl);
    console.log("travel_app can now log in. Point the API at it:");
    console.log(`  DATABASE_URL=postgresql://travel_app:<APP_DB_PASSWORD>@${u.host}${u.pathname}`);
    console.log("and keep the owner connection for migrations only:");
    console.log("  DATABASE_MIGRATION_URL=<your existing owner URL>");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
