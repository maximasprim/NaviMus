import { eq, schema } from "../../client.js";
import { encryptField, hashPassword } from "@travel/auth";
import type { CatalogRefs } from "./catalog.js";
import { daysAgo, demoPhone, isoDay, must, type Db } from "./helpers.js";

/**
 * Passwords for the EXTRA demo accounts (the four headline accounts are defined in seed/index.ts).
 * Dev/CI only - these live in source control, so never seed them into a production database.
 */
export const EXTRA_PASSWORDS = {
  staff: "@0743493619Ss", // admin/manager/finance/support/marketing/guide/destination staff, extra-tenant admins
  operator: "@0743493619Oo", // operator-company staff (same as operator@navimus.co.ke)
  customer: "@0743493619Cc", // every extra customer (same as customer@navimus.co.ke)
} as const;

export interface PersonRef { id: string; tenantId: string; email: string; first: string; last: string; phone: string }
export interface TravelerRef { id: string; type: "adult" | "child" | "infant"; first: string; last: string }
export interface CustomerRef extends PersonRef { travelers: TravelerRef[]; status: string }
export interface PeopleRefs {
  staff: Map<string, PersonRef>;
  customers: { default: CustomerRef[]; enroute: CustomerRef[] };
  extraTenants: { trial: string; suspended: string };
}

interface StaffSpec { alias: string; email: string; first: string; last: string; roles: string[]; password: keyof typeof EXTRA_PASSWORDS; tenant: "default" | "enroute"; operator?: { key: string; title: string } }

const STAFF: StaffSpec[] = [
  { alias: "manager", email: "manager@navimus.co.ke", first: "Wanjiku", last: "Mwangi", roles: ["admin"], password: "staff", tenant: "default" },
  { alias: "travel_manager", email: "travel.manager@navimus.co.ke", first: "Peter", last: "Ochieng", roles: ["travel_manager"], password: "staff", tenant: "default" },
  { alias: "destination_manager", email: "destinations@navimus.co.ke", first: "Grace", last: "Njeri", roles: ["destination_manager"], password: "staff", tenant: "default" },
  { alias: "finance", email: "finance@navimus.co.ke", first: "Samuel", last: "Kiptoo", roles: ["finance_manager"], password: "staff", tenant: "default" },
  { alias: "support", email: "support@navimus.co.ke", first: "Joy", last: "Akinyi", roles: ["customer_support"], password: "staff", tenant: "default" },
  { alias: "marketing", email: "marketing@navimus.co.ke", first: "Linda", last: "Chebet", roles: ["marketing_manager"], password: "staff", tenant: "default" },
  { alias: "guide", email: "guide@navimus.co.ke", first: "Daniel", last: "Lekishon", roles: ["tour_guide"], password: "staff", tenant: "default" },
  { alias: "lodges", email: "stays@navimus.co.ke", first: "Mercy", last: "Naserian", roles: ["accommodation_provider", "tour_operator"], password: "operator", tenant: "default", operator: { key: "lodges", title: "Owner" } },
  { alias: "movers", email: "transport@navimus.co.ke", first: "Hassan", last: "Abdi", roles: ["transport_provider", "tour_operator"], password: "operator", tenant: "default", operator: { key: "movers", title: "Fleet Manager" } },
  { alias: "coastal", email: "coastal.ops@navimus.co.ke", first: "Fatuma", last: "Mwinyi", roles: ["tour_operator"], password: "operator", tenant: "default", operator: { key: "coastal", title: "Owner" } },
  { alias: "trails", email: "trails.ops@navimus.co.ke", first: "Kevin", last: "Gitau", roles: ["tour_operator"], password: "operator", tenant: "default", operator: { key: "trails", title: "Owner" } },
  { alias: "heritage", email: "heritage.ops@navimus.co.ke", first: "Zawadi", last: "Said", roles: ["tour_operator"], password: "operator", tenant: "default", operator: { key: "heritage", title: "Owner" } },
  { alias: "pending", email: "baobab.ops@navimus.co.ke", first: "Baraka", last: "Mushi", roles: ["tour_operator"], password: "operator", tenant: "default", operator: { key: "pending", title: "Owner" } },
  { alias: "enroute_finance", email: "finance@enroute.co.ke", first: "Rehema", last: "Juma", roles: ["finance_manager"], password: "staff", tenant: "enroute" },
  { alias: "enroute_escapes", email: "escapes.ops@enroute.co.ke", first: "Omar", last: "Bakari", roles: ["tour_operator"], password: "operator", tenant: "enroute", operator: { key: "escapes", title: "Owner" } },
  { alias: "enroute_city", email: "city.ops@enroute.co.ke", first: "Salma", last: "Hamisi", roles: ["tour_operator"], password: "operator", tenant: "enroute", operator: { key: "city", title: "Owner" } },
];

interface CustomerSpec { first: string; last: string; email: string; nationality: string; status?: string; verified?: boolean }

const DEFAULT_CUSTOMERS: CustomerSpec[] = [
  { first: "Amina", last: "Hassan", email: "amina.hassan@navimus.co.ke", nationality: "KE" },
  { first: "Brian", last: "Otieno", email: "brian.otieno@navimus.co.ke", nationality: "KE" },
  { first: "Catherine", last: "Wanjiru", email: "catherine.wanjiru@navimus.co.ke", nationality: "KE" },
  { first: "David", last: "Kimani", email: "david.kimani@navimus.co.ke", nationality: "KE" },
  { first: "Esther", last: "Achieng", email: "esther.achieng@navimus.co.ke", nationality: "KE" },
  { first: "Faith", last: "Mutua", email: "faith.mutua@navimus.co.ke", nationality: "KE" },
  { first: "George", last: "Omondi", email: "george.omondi@navimus.co.ke", nationality: "KE" },
  { first: "Hannah", last: "Smith", email: "hannah.smith@navimus.co.ke", nationality: "GB" },
  { first: "James", last: "Miller", email: "james.miller@navimus.co.ke", nationality: "US" },
  { first: "Klaus", last: "Weber", email: "klaus.weber@navimus.co.ke", nationality: "DE" },
  { first: "Priya", last: "Patel", email: "priya.patel@navimus.co.ke", nationality: "IN" },
  { first: "Sofia", last: "Rossi", email: "sofia.rossi@navimus.co.ke", nationality: "IT", verified: false },
  { first: "Tom", last: "Baker", email: "tom.baker@navimus.co.ke", nationality: "AU", status: "suspended" },
  { first: "Ursula", last: "Keller", email: "ursula.keller@navimus.co.ke", nationality: "CH", status: "deactivated" },
];

const ENROUTE_CUSTOMERS: CustomerSpec[] = [
  { first: "Kamau", last: "Njoroge", email: "kamau.njoroge@enroute.co.ke", nationality: "KE" },
  { first: "Lucy", last: "Wambui", email: "lucy.wambui@enroute.co.ke", nationality: "KE" },
  { first: "Mohamed", last: "Said", email: "mohamed.said@enroute.co.ke", nationality: "KE" },
  { first: "Nancy", last: "Adhiambo", email: "nancy.adhiambo@enroute.co.ke", nationality: "KE" },
];

function passportFor(n: number): string | null {
  try {
    return encryptField(`A${String(1000000 + n)}`);
  } catch {
    return null; // ENCRYPTION_KEY not configured - skip sensitive fields rather than fail the whole seed
  }
}

async function createCustomers(
  db: Db, tenantId: string, specs: CustomerSpec[], passwordHash: string, startPhone: number, counter: { n: number }
): Promise<CustomerRef[]> {
  const rows = await db
    .insert(schema.users)
    .values(
      specs.map((s, i) => ({
        tenantId, email: s.email, passwordHash, firstName: s.first, lastName: s.last, nationality: s.nationality, phone: demoPhone(startPhone + i),
        status: s.status ?? "active", emailVerifiedAt: s.verified === false ? null : daysAgo(120 - i * 5),
        createdAt: daysAgo(200 - i * 12),
      }))
    )
    .returning();
  return buildCustomerRefs(db, tenantId, rows, specs, counter, startPhone);
}

async function buildCustomerRefs(
  db: Db, tenantId: string, rows: Array<typeof schema.users.$inferSelect>, specs: Array<{ nationality: string }>, counter: { n: number }, startPhone: number
): Promise<CustomerRef[]> {
  const customerRole = must((await db.select().from(schema.roles).where(eq(schema.roles.name, "customer")))[0], "customer role");
  await db.insert(schema.userRoles).values(rows.map((r) => ({ userId: r.id, roleId: customerRole.id })));

  const out: CustomerRef[] = [];
  for (const [i, row] of rows.entries()) {
    const nationality = specs[i]?.nationality ?? "KE";
    const travelerRows: Array<typeof schema.travelers.$inferInsert> = [
      {
        tenantId, ownerUserId: row.id, firstName: row.firstName, lastName: row.lastName, dateOfBirth: isoDay(daysAgo(365 * (28 + (i % 15)))), gender: i % 2 === 0 ? "female" : "male",
        nationality, passportNumberEncrypted: passportFor(++counter.n), passportExpiryDate: isoDay(daysAgo(-365 * (2 + (i % 5)))), phone: row.phone, email: row.email,
        emergencyContactName: "Emergency Contact", emergencyContactPhone: demoPhone(9000 + counter.n), dietaryRequirements: i % 4 === 0 ? "Vegetarian" : null,
      },
    ];
    if (i % 2 === 0) {
      travelerRows.push({
        tenantId, ownerUserId: row.id, firstName: i % 4 === 0 ? "Partner" : "Companion", lastName: row.lastName, dateOfBirth: isoDay(daysAgo(365 * (30 + (i % 12)))),
        gender: i % 2 === 0 ? "male" : "female", nationality, passportNumberEncrypted: passportFor(++counter.n), passportExpiryDate: isoDay(daysAgo(-365 * 3)),
        phone: demoPhone(startPhone + 500 + i), emergencyContactName: row.firstName, emergencyContactPhone: row.phone,
      });
    }
    if (i % 3 === 0) {
      travelerRows.push({
        tenantId, ownerUserId: row.id, firstName: "Junior", lastName: row.lastName, dateOfBirth: isoDay(daysAgo(365 * 9)), gender: "male", nationality,
        passportNumberEncrypted: passportFor(++counter.n), passportExpiryDate: isoDay(daysAgo(-365 * 3)), emergencyContactName: row.firstName,
        emergencyContactPhone: row.phone, accessibilityRequirements: i === 0 ? "Needs a booster seat" : null,
      });
    }
    const inserted = await db.insert(schema.travelers).values(travelerRows).returning();
    out.push({
      id: row.id, tenantId, email: row.email, first: row.firstName, last: row.lastName, phone: row.phone ?? demoPhone(startPhone + i), status: row.status,
      travelers: inserted.map((t) => ({
        id: t.id, first: t.firstName, last: t.lastName,
        type: t.firstName === "Junior" ? ("child" as const) : ("adult" as const),
      })),
    });
  }
  return out;
}

export async function seedPeople(db: Db, refs: CatalogRefs): Promise<PeopleRefs> {
  const [staffHash, operatorHash, customerHash] = await Promise.all([
    hashPassword(EXTRA_PASSWORDS.staff), hashPassword(EXTRA_PASSWORDS.operator), hashPassword(EXTRA_PASSWORDS.customer),
  ]);
  const hashes = { staff: staffHash, operator: operatorHash, customer: customerHash };
  const tenantIds = { default: refs.tenants.default, enroute: refs.tenants.enroute };

  const roles = new Map((await db.select().from(schema.roles)).map((r) => [r.name, r.id]));
  const plans = new Map((await db.select().from(schema.plans)).map((p) => [p.code, p.id]));

  // ---- staff and operator-company users
  console.log("  - staff and operator users");
  const staff = new Map<string, PersonRef>();
  const staffRows = await db
    .insert(schema.users)
    .values(
      STAFF.map((s, i) => ({
        tenantId: tenantIds[s.tenant], email: s.email, passwordHash: hashes[s.password], firstName: s.first, lastName: s.last, phone: demoPhone(100 + i),
        status: "active", emailVerifiedAt: daysAgo(300), nationality: "KE", createdAt: daysAgo(300),
      }))
    )
    .returning();
  for (const [i, row] of staffRows.entries()) {
    const spec = must(STAFF[i], "staff spec");
    staff.set(spec.alias, { id: row.id, tenantId: row.tenantId, email: row.email, first: row.firstName, last: row.lastName, phone: row.phone ?? "" });
    await db.insert(schema.userRoles).values(spec.roles.map((r) => ({ userId: row.id, roleId: must(roles.get(r), `role ${r}`) })));
    if (spec.operator) {
      const cat = spec.tenant === "default" ? refs.default : refs.enroute;
      const op = must(cat.operators.get(spec.operator.key), `operator ${spec.operator.key}`);
      await db.insert(schema.operatorUsers).values({ operatorId: op.id, userId: row.id, title: spec.operator.title });
    }
  }

  // ---- customers
  console.log("  - customers and saved travelers");
  const counter = { n: 0 };
  const existingCustomer = must((await db.select().from(schema.users).where(eq(schema.users.email, "customer@navimus.co.ke")))[0], "seed customer");
  const existingRefs = await buildExisting(db, existingCustomer, counter);
  const defaultCustomers = [existingRefs, ...(await createCustomers(db, tenantIds.default, DEFAULT_CUSTOMERS, hashes.customer, 1000, counter))];
  const enrouteCustomers = await createCustomers(db, tenantIds.enroute, ENROUTE_CUSTOMERS, hashes.customer, 2000, counter);

  // ---- two more tenants, for platform-admin testing: one on trial, one suspended
  console.log("  - extra tenants (trial, suspended)");
  const [trial] = await db
    .insert(schema.tenants)
    .values({ name: "Kilimani Escapes (Trial)", slug: "kilimani-escapes-trial", status: "trial", planId: plans.get("free") })
    .returning();
  const [suspended] = await db
    .insert(schema.tenants)
    .values({
      name: "Dusty Trails Co (Suspended)", slug: "dusty-trails-suspended", status: "suspended", planId: plans.get("starter"),
      suspendedAt: daysAgo(14), suspendedReason: "Demo: unpaid invoices - use this tenant to test suspension and reactivation.",
    })
    .returning();
  const extraAdmins = await db
    .insert(schema.users)
    .values([
      { tenantId: trial!.id, email: "admin@trial.navimus.co.ke", passwordHash: hashes.staff, firstName: "Trial", lastName: "Admin", status: "active", emailVerifiedAt: daysAgo(10) },
      { tenantId: suspended!.id, email: "admin@suspended.navimus.co.ke", passwordHash: hashes.staff, firstName: "Suspended", lastName: "Admin", status: "active", emailVerifiedAt: daysAgo(90) },
    ])
    .returning();
  await db.insert(schema.userRoles).values(extraAdmins.map((u) => ({ userId: u.id, roleId: must(roles.get("admin"), "admin role") })));
  await db.update(schema.tenants).set({ ownerUserId: extraAdmins[0]!.id }).where(eq(schema.tenants.id, trial!.id));
  await db.update(schema.tenants).set({ ownerUserId: extraAdmins[1]!.id }).where(eq(schema.tenants.id, suspended!.id));
  // The two base tenants' owners: the default tenant had none.
  const mgr = must(staff.get("manager"), "manager");
  await db.update(schema.tenants).set({ ownerUserId: mgr.id }).where(eq(schema.tenants.id, tenantIds.default));

  return { staff, customers: { default: defaultCustomers, enroute: enrouteCustomers }, extraTenants: { trial: trial!.id, suspended: suspended!.id } };
}

/** The base seed's customer already exists (with its customer role); only travelers are missing. */
async function buildExisting(db: Db, row: typeof schema.users.$inferSelect, counter: { n: number }): Promise<CustomerRef> {
  await db.update(schema.users).set({ emailVerifiedAt: daysAgo(150), nationality: "KE", phone: row.phone ?? demoPhone(999) }).where(eq(schema.users.id, row.id));
  const inserted = await db
    .insert(schema.travelers)
    .values([
      { tenantId: row.tenantId, ownerUserId: row.id, firstName: row.firstName, lastName: row.lastName, dateOfBirth: "1990-04-12", gender: "female", nationality: "KE", passportNumberEncrypted: passportFor(++counter.n), passportExpiryDate: isoDay(daysAgo(-365 * 4)), phone: row.phone ?? demoPhone(999), email: row.email, emergencyContactName: "Emergency Contact", emergencyContactPhone: demoPhone(9999) },
      { tenantId: row.tenantId, ownerUserId: row.id, firstName: "Companion", lastName: row.lastName, dateOfBirth: "1988-09-03", gender: "male", nationality: "KE", passportNumberEncrypted: passportFor(++counter.n), passportExpiryDate: isoDay(daysAgo(-365 * 3)) },
      { tenantId: row.tenantId, ownerUserId: row.id, firstName: "Junior", lastName: row.lastName, dateOfBirth: isoDay(daysAgo(365 * 8)), gender: "male", nationality: "KE", passportNumberEncrypted: passportFor(++counter.n), passportExpiryDate: isoDay(daysAgo(-365 * 3)) },
    ])
    .returning();
  return {
    id: row.id, tenantId: row.tenantId, email: row.email, first: row.firstName, last: row.lastName, phone: row.phone ?? demoPhone(999), status: "active",
    travelers: inserted.map((t) => ({ id: t.id, first: t.firstName, last: t.lastName, type: t.firstName === "Junior" ? ("child" as const) : ("adult" as const) })),
  };
}
