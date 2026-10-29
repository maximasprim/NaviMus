import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { checkRlsEnforcement, createDb, runInBypassContext, runInTenantContext, schema } from "./index.js";
import { eq } from "drizzle-orm";

/**
 * Proves tenant isolation at the DATABASE level, as the unprivileged
 * application role - the only role RLS applies to.
 *
 * Needs a migrated + seeded Postgres with the `travel_app` role given a
 * password. Skipped (not failed) when the env vars are absent so that a
 * plain `pnpm test` works on a laptop; CI provides them (see
 * .github/workflows/integration.yml, job "integration").
 *
 *   RLS_TEST_ADMIN_URL  owner/superuser connection (inspects ground truth)
 *   RLS_TEST_APP_URL    connection as travel_app
 */
const ADMIN_URL = process.env.RLS_TEST_ADMIN_URL;
const APP_URL = process.env.RLS_TEST_APP_URL;
const maybe = ADMIN_URL && APP_URL ? describe : describe.skip;

maybe("row-level security (as travel_app)", () => {
  const admin = postgres(ADMIN_URL ?? "", { max: 1 });
  const appDb = createDb(APP_URL ?? "", { name: "rls-test", poolMax: 4 });
  let tenantA = "";
  let tenantB = "";
  let truth: Record<string, { a: number; b: number }> = {};

  // Tables spanning every policy shape: direct, child-of-parent, 2-level child, nullable-fk.
  const probes = ["users", "bookings", "packages", "payments", "travelers", "favorites", "package_prices", "ledger_entries", "payment_transactions", "rooms", "notification_logs"];

  const tag = `rlstest-${Date.now()}`;

  /** Creates one of each interesting row for a tenant, as the owner (ground truth, bypasses RLS). */
  async function makeFixtures(tenantId: string, label: string) {
    const [u] = await admin`select id from users where tenant_id = ${tenantId} limit 1`;
    expect(u, `tenant ${label} needs a seeded user`).toBeTruthy();
    const userId = u!.id as string;
    const [b] = await admin`
      insert into bookings (tenant_id, user_id, travel_date, currency, contact_email, contact_phone, idempotency_key)
      values (${tenantId}, ${userId}, '2030-01-01', 'USD', 'x@example.test', '+254700000000', ${`${tag}-b-${label}`}) returning id`;
    const [p] = await admin`
      insert into payments (tenant_id, booking_id, provider, original_amount, original_currency, base_currency_amount, idempotency_key)
      values (${tenantId}, ${b!.id}, 'mock', 10, 'USD', 10, ${`${tag}-p-${label}`}) returning id`;
    await admin`insert into payment_transactions (payment_id, provider_reference) values (${p!.id}, ${`${tag}-ref-${label}`})`;
    await admin`insert into ledger_entries (booking_id, payment_id, entry_type, amount, currency) values (${b!.id}, ${p!.id}, 'customer_payment', 10, 'USD')`;
    await admin`insert into travelers (tenant_id, owner_user_id, first_name, last_name) values (${tenantId}, ${userId}, ${tag}, ${label})`;
    await admin`insert into favorites (tenant_id, user_id, subject_type, subject_id) values (${tenantId}, ${userId}, 'destination', gen_random_uuid())`;
    await admin`insert into notification_logs (tenant_id, user_id, template_key, channel, recipient, status) values (${tenantId}, ${userId}, ${tag}, 'email', 'x@example.test', 'sent')`;
    // guest notification: no user at all - must still belong to (and be usable by) its tenant
    await admin`insert into notification_logs (tenant_id, user_id, template_key, channel, recipient, status) values (${tenantId}, NULL, ${tag}, 'email', 'guest@example.test', 'queued')`;
  }

  beforeAll(async () => {
    const t = await admin`select id from tenants order by created_at limit 2`;
    expect(t.length, "run db:seed first - needs two tenants").toBe(2);
    [tenantA, tenantB] = t.map((r) => r.id as string) as [string, string];
    await makeFixtures(tenantA, "a");
    await makeFixtures(tenantB, "b");

    for (const table of probes) {
      const direct = await admin`select 1 from information_schema.columns where table_name = ${table} and column_name = 'tenant_id'`;
      if (direct.length) {
        const [a] = await admin.unsafe(`select count(*)::int n from ${table} where tenant_id = '${tenantA}'`);
        const [b] = await admin.unsafe(`select count(*)::int n from ${table} where tenant_id = '${tenantB}'`);
        truth[table] = { a: a!.n, b: b!.n };
      }
    }
  });

  afterAll(async () => {
    await admin`delete from notification_logs where template_key = ${tag}`;
    await admin`delete from ledger_entries where booking_id in (select id from bookings where idempotency_key like ${tag + "%"})`;
    await admin`delete from payment_transactions where provider_reference like ${tag + "%"}`;
    await admin`delete from payments where idempotency_key like ${tag + "%"}`;
    await admin`delete from bookings where idempotency_key like ${tag + "%"}`;
    await admin`delete from travelers where first_name = ${tag}`;
    await admin`delete from favorites where subject_type = 'destination' and subject_id not in (select id from destinations)`;
    await admin.end();
  });

  const count = async (table: string) => {
    const r: any = await appDb.execute(sql.raw(`select count(*)::int n from ${table}`));
    return r[0].n as number;
  };

  it("the app role is actually subject to RLS (not superuser / BYPASSRLS / owner)", async () => {
    const report = await checkRlsEnforcement(appDb);
    expect(report.problems).toEqual([]);
    expect(report.enforced).toBe(true);
  });

  it("the migration/owner role is detected as NOT enforced (the Supabase-postgres trap)", async () => {
    const ownerDb = createDb(ADMIN_URL ?? "", { name: "rls-test-admin", poolMax: 1 });
    const report = await checkRlsEnforcement(ownerDb);
    expect(report.enforced).toBe(false);
  });

  it("a session with no tenant context sees NOTHING (fails closed, not open)", async () => {
    for (const table of probes) expect(await count(table), table).toBe(0);
  });

  it("tenant A sees exactly its own rows and none of tenant B's, on every policy shape", async () => {
    await runInTenantContext(appDb, tenantA, async () => {
      for (const table of Object.keys(truth)) expect(await count(table), table).toBe(truth[table]!.a);
      // and nothing at all that belongs to B
      const leaked: any = await appDb.execute(sql`select count(*)::int n from bookings where tenant_id = ${tenantB}`);
      expect(leaked[0].n).toBe(0);
    });
  });

  it("child tables inherit visibility from their parent (2-level chain: rooms -> room_types -> accommodations)", async () => {
    const [truthA] = await admin.unsafe(
      `select count(*)::int n from rooms r join room_types rt on rt.id=r.room_type_id join accommodations a on a.id=rt.accommodation_id where a.tenant_id='${tenantA}'`
    );
    await runInTenantContext(appDb, tenantA, async () => {
      expect(await count("rooms")).toBe(truthA!.n);
    });
  });

  it("a tenant can insert, read back (RETURNING) and update its own guest notification rows", async () => {
    await runInTenantContext(appDb, tenantA, async () => {
      const [row] = await appDb
        .insert(schema.notificationLogs)
        .values({ tenantId: tenantA, userId: null, templateKey: tag, channel: "email", recipient: "g2@example.test", status: "queued" })
        .returning();
      expect(row?.id).toBeTruthy();
      const upd = await appDb.update(schema.notificationLogs).set({ status: "sent" }).where(eq(schema.notificationLogs.id, row!.id)).returning();
      expect(upd).toHaveLength(1);
    });
    await admin`delete from notification_logs where recipient = 'g2@example.test'`; // keep ground-truth counts stable for later tests
  });

  it("tenant A cannot INSERT a row stamped for tenant B (WITH CHECK)", async () => {
    await expect(
      runInTenantContext(appDb, tenantA, async () => {
        await appDb.insert(schema.favorites).values({
          tenantId: tenantB,
          userId: (await admin`select id from users where tenant_id = ${tenantB} limit 1`)[0]!.id as string,
          subjectType: "destination",
          subjectId: "00000000-0000-0000-0000-0000000000aa",
        });
      })
    ).rejects.toThrow();
  });

  it("tenant A cannot UPDATE or DELETE tenant B's rows (silently matches zero)", async () => {
    await runInTenantContext(appDb, tenantA, async () => {
      const upd = await appDb.update(schema.packages).set({ featured: true }).where(eq(schema.packages.tenantId, tenantB)).returning({ id: schema.packages.id });
      expect(upd).toHaveLength(0);
      const del = await appDb.delete(schema.coupons).where(eq(schema.coupons.tenantId, tenantB)).returning({ id: schema.coupons.id });
      expect(del).toHaveLength(0);
    });
  });

  it("tenant A can read tenants (needed for resolution) but cannot modify another tenant", async () => {
    await runInTenantContext(appDb, tenantA, async () => {
      expect(await count("tenants")).toBeGreaterThanOrEqual(2);
      const upd = await appDb.update(schema.tenants).set({ name: "pwned" }).where(eq(schema.tenants.id, tenantB)).returning({ id: schema.tenants.id });
      expect(upd).toHaveLength(0);
    });
  });

  it("platform-level default settings (tenant_id NULL) are readable by tenants but not writable", async () => {
    const [seed] = await admin`insert into system_settings (tenant_id, key, value) values (NULL, ${tag + "-default"}, '1'::jsonb) returning id`;
    try {
      await runInTenantContext(appDb, tenantA, async () => {
        const rows = await appDb.select().from(schema.systemSettings).where(eq(schema.systemSettings.key, tag + "-default"));
        expect(rows).toHaveLength(1); // the fallback read the commission/reminder code depends on
        const upd = await appDb.update(schema.systemSettings).set({ value: 2 as any }).where(eq(schema.systemSettings.key, tag + "-default")).returning();
        expect(upd).toHaveLength(0); // ...but a tenant cannot change the platform default
        // Run in a savepoint: a rejected statement aborts the enclosing transaction otherwise.
        await expect(
          appDb.transaction((sp) => sp.insert(schema.systemSettings).values({ tenantId: null as any, key: tag + "-x", value: 1 as any }))
        ).rejects.toThrow();
      });
    } finally {
      await admin`delete from system_settings where id = ${seed!.id}`;
    }
  });

  it("platform-level audit logs (tenant_id NULL) stay hidden from tenant sessions", async () => {
    const [row] = await admin`insert into audit_logs (tenant_id, action, resource_type) values (NULL, ${tag}, 'test') returning id`;
    try {
      await runInTenantContext(appDb, tenantA, async () => {
        const r: any = await appDb.execute(sql`select count(*)::int n from audit_logs where action = ${tag}`);
        expect(r[0].n).toBe(0);
      });
    } finally {
      await admin`delete from audit_logs where id = ${row!.id}`;
    }
  });

  it("bypass context sees every tenant", async () => {
    await runInBypassContext(appDb, async () => {
      for (const table of Object.keys(truth)) expect(await count(table), table).toBe(truth[table]!.a + truth[table]!.b + (await extraRows(table)));
    });
  });

  // rows belonging to tenants other than A/B (if any more were seeded)
  async function extraRows(table: string) {
    const [r] = await admin.unsafe(`select count(*)::int n from ${table} where tenant_id not in ('${tenantA}','${tenantB}')`);
    return r!.n as number;
  }

  it("a bypass block nested in a tenant request does NOT leave RLS switched off afterwards", async () => {
    await runInTenantContext(appDb, tenantA, async () => {
      const before = await count("bookings");
      await runInBypassContext(appDb, async () => {
        expect(await count("bookings")).toBeGreaterThanOrEqual(before);
      });
      expect(await count("bookings")).toBe(before); // back to tenant-only
    });
  });

  it("settings never leak to the next request that reuses the pooled connection", async () => {
    await runInTenantContext(appDb, tenantA, async () => {
      expect(await count("users")).toBeGreaterThan(0);
    });
    // pool max is 4: hammer it so the same physical connection is reused
    for (let i = 0; i < 12; i++) expect(await count("users")).toBe(0);
  });

  it("concurrent requests for different tenants never see each other's data", async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) => {
        const tenant = i % 2 === 0 ? tenantA : tenantB;
        return runInTenantContext(appDb, tenant, async () => {
          await new Promise((r) => setTimeout(r, Math.random() * 15));
          const rows: any = await appDb.execute(sql`select distinct tenant_id from bookings`);
          return { tenant, seen: rows.map((r: any) => r.tenant_id as string) };
        });
      })
    );
    for (const r of results) expect(r.seen.every((id: string) => id === r.tenant)).toBe(true);
  });
});
