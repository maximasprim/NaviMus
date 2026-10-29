import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index.js";
import { wrapWithRlsContext } from "./rls-context.js";

export interface CreateDbOptions {
  /** Max connections for this pool. Defaults to DB_POOL_MAX, else 20. */
  poolMax?: number;
  /** Separate pools can be created per workload (e.g. background workers) so they can't starve API requests. */
  name?: string;
}

const pools = new Map<string, ReturnType<typeof build>>();

function build(connectionString: string, poolMax: number) {
  const client = postgres(connectionString, {
    max: poolMax,
    idle_timeout: 20,
    connect_timeout: 10,
  });
  const raw = drizzle(client, { schema, logger: process.env.NODE_ENV === "development" });
  // Redirects to the ambient RLS context's transaction when one is active
  // (see rls-context.ts); otherwise a plain drizzle instance.
  return wrapWithRlsContext(raw);
}

/**
 * Shared connection factory. Memoized per (connection string, pool name):
 * this process used to open a separate 10-connection pool for each of its
 * 15 mounted services - up to 150 Postgres connections from one gateway,
 * which exhausts a pooler like Supabase's. Every service now gets the same
 * pool unless it asks for a named one.
 */
export function createDb(connectionString: string, opts: CreateDbOptions = {}) {
  const key = `${opts.name ?? "default"}::${connectionString}`;
  let db = pools.get(key);
  if (!db) {
    const poolMax = opts.poolMax ?? Number(process.env.DB_POOL_MAX ?? 20);
    db = build(connectionString, poolMax);
    pools.set(key, db);
  }
  return db;
}

export type Database = ReturnType<typeof createDb>;

export * as schema from "./schema/index.js";
export {
  sql,
  eq,
  and,
  or,
  not,
  desc,
  asc,
  gte,
  lte,
  gt,
  lt,
  inArray,
  isNull,
  isNotNull,
  ilike,
  exists,
  between,
} from "drizzle-orm";
export type { Column } from "drizzle-orm";
