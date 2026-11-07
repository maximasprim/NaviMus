import { eq, schema } from "../../client.js";
import type { CatalogRefs } from "./catalog.js";
import type { BookingRef, CommerceRefs } from "./commerce.js";
import type { PeopleRefs } from "./people.js";
import { daysAgo, makeRng, must, type Db } from "./helpers.js";

const PAID_OR_LATER = new Set(["CONFIRMED", "PARTIALLY_PAID", "FULLY_PAID", "UPCOMING", "IN_PROGRESS", "COMPLETED", "CANCEL_REQUESTED", "CANCELLED", "REFUND_PENDING", "REFUNDED"]);

export async function seedEngagement(db: Db, refs: CatalogRefs, people: PeopleRefs, commerce: CommerceRefs) {
  const rng = makeRng(424242);
  const superAdmin = must((await db.select().from(schema.users).where(eq(schema.users.email, "admin@navimus.co.ke")))[0], "super admin");
  const staff = (alias: string) => must(people.staff.get(alias), `staff ${alias}`);
  const byKey = new Map(commerce.bookings.map((b) => [b.key, b]));
  const booking = (key: string): BookingRef => must(byKey.get(key), `booking ${key}`);

  // ---------------------------------------------------------- notification logs
  console.log("  - notification logs");
  const logs: Array<typeof schema.notificationLogs.$inferInsert> = [];
  const pushLog = (b: BookingRef, key: string, channel: "email" | "sms" | "in_app", offsetMin: number, status?: string) => {
    const at = new Date(b.createdAt.getTime() + offsetMin * 60_000);
    const roll = rng();
    const st = status ?? (roll < 0.04 ? "failed" : roll < 0.1 ? "queued" : roll < 0.7 ? "delivered" : "sent");
    logs.push({
      tenantId: b.tenantId, userId: b.userId, templateKey: key, channel, recipient: channel === "sms" ? b.userPhone : b.userEmail, status: st,
      providerReference: st === "failed" || st === "queued" ? null : `seed-${channel}-${logs.length + 1}`,
      errorMessage: st === "failed" ? "Provider timeout (demo failure for testing retries)" : null, metadata: { bookingId: b.id, packageName: b.packageName },
      sentAt: st === "queued" ? null : at, readAt: channel === "in_app" && rng() < 0.6 ? new Date(at.getTime() + 3_600_000) : null, createdAt: at,
    });
  };
  for (const b of commerce.bookings) {
    if (b.status === "DRAFT") continue;
    pushLog(b, "booking.created", "email", 1);
    if (PAID_OR_LATER.has(b.status)) {
      pushLog(b, "payment.succeeded", "email", 35);
      pushLog(b, "booking.confirmed", "email", 62);
      pushLog(b, "booking.confirmed", "sms", 62);
      pushLog(b, "booking.confirmed", "in_app", 62);
    }
    if (b.status === "FAILED") pushLog(b, "payment.failed", "email", 35);
    if (b.status === "EXPIRED") pushLog(b, "booking.expired", "email", 20);
    if (["CANCELLED", "REFUND_PENDING", "REFUNDED"].includes(b.status)) pushLog(b, "booking.cancelled", "email", 600);
    if (b.status === "REFUNDED") pushLog(b, "refund.completed", "email", 900);
    if (b.status === "UPCOMING") pushLog(b, "trip.reminder", "sms", 60 * 24 * 5);
    if (b.status === "COMPLETED") pushLog(b, "review.request", "email", 60 * 24 * 30);
  }
  await db.insert(schema.notificationLogs).values(logs);

  // ------------------------------------------------------------ support tickets
  console.log("  - support tickets");
  const support = staff("support");
  const tickets: Array<{ b: BookingRef | null; user: { id: string }; tenantId: string; subject: string; status: string; priority: string; assignee: string | null; ago: number; messages: Array<[("customer" | "staff"), string]> }> = [
    { b: booking("d26"), user: { id: booking("d26").userId }, tenantId: refs.tenants.default, subject: "When will my refund arrive?", status: "in_progress", priority: "high", assignee: support.id, ago: 6, messages: [["customer", "I cancelled my family safari 20 days before travel. When will the refund reach my card?"], ["staff", "Thanks for reaching out - the refund is with Stripe and normally lands in 5-10 business days. I'll keep this open until it clears."], ["customer", "Great, thank you."]] },
    { b: booking("d23"), user: { id: booking("d23").userId }, tenantId: refs.tenants.default, subject: "Card was declined but I was charged", status: "open", priority: "urgent", assignee: null, ago: 1, messages: [["customer", "My payment failed on the site but my bank shows a pending charge. Can you check?"]] },
    { b: booking("d10"), user: { id: booking("d10").userId }, tenantId: refs.tenants.default, subject: "Feedback about our boat transfer", status: "resolved", priority: "normal", assignee: support.id, ago: 4, messages: [["customer", "Our boat transfer to Lamu was an hour late and no one called us."], ["staff", "I'm sorry - I've raised this with the operator and they've changed their dispatch process. A 10% credit has been added to your account."], ["customer", "Thank you, appreciated."]] },
    { b: booking("d24"), user: { id: booking("d24").userId }, tenantId: refs.tenants.default, subject: "Cancellation policy question", status: "open", priority: "normal", assignee: support.id, ago: 7, messages: [["customer", "If I cancel the Lamu trip next week, how much would I get back?"], ["staff", "It depends on the days left before travel - your booking is on the Flexible policy. Could you confirm your travel date?"]] },
    { b: booking("d12"), user: { id: booking("d12").userId }, tenantId: refs.tenants.default, subject: "Seating request for the children", status: "closed", priority: "low", assignee: support.id, ago: 10, messages: [["customer", "Can the children sit by the window in the safari vehicle?"], ["staff", "Noted with the operator - every seat in a pop-top has a window view."]] },
    { b: null, user: { id: people.customers.default[8]!.id }, tenantId: refs.tenants.default, subject: "Do you offer wheelchair-accessible safaris?", status: "open", priority: "normal", assignee: null, ago: 2, messages: [["customer", "My father uses a wheelchair. Do you have accessible vehicles and lodges?"]] },
    { b: booking("e06"), user: { id: booking("e06").userId }, tenantId: refs.tenants.enroute, subject: "Refund for Watamu day trip", status: "resolved", priority: "normal", assignee: staff("enroute_finance").id, ago: 12, messages: [["customer", "Has my Watamu refund been processed?"], ["staff", "Yes - refunded in full to your original payment method."]] },
  ];
  for (const t of tickets) {
    const createdAt = daysAgo(t.ago);
    const [ticket] = await db
      .insert(schema.supportTickets)
      .values({ userId: t.user.id, bookingId: t.b?.id ?? null, subject: t.subject, status: t.status, priority: t.priority, assignedToUserId: t.assignee, createdAt, updatedAt: createdAt })
      .returning();
    await db.insert(schema.supportMessages).values(
      t.messages.map(([who, body], i) => ({
        ticketId: ticket!.id, senderUserId: who === "customer" ? t.user.id : (t.assignee ?? support.id), body, createdAt: new Date(createdAt.getTime() + i * 3 * 3_600_000),
      }))
    );
  }

  // ---------------------------------------------------- favorites & search logs
  console.log("  - favorites and search history");
  const def = refs.default;
  const favPkgs = [...def.packages.values()].filter((p) => p.status === "published");
  const favDests = [...def.destinations.values()];
  const favAccs = [...def.accommodations.values()];
  const favs: Array<typeof schema.favorites.$inferInsert> = [];
  const seen = new Set<string>();
  const addFav = (userId: string, tenantId: string, type: string, id: string) => {
    const k = `${userId}:${type}:${id}`;
    if (seen.has(k)) return;
    seen.add(k);
    favs.push({ tenantId, userId, subjectType: type, subjectId: id, createdAt: daysAgo(Math.floor(rng() * 90)) });
  };
  for (const [i, c] of people.customers.default.slice(0, 12).entries()) {
    addFav(c.id, c.tenantId, "package", must(favPkgs[(i * 3) % favPkgs.length], "pkg").id);
    addFav(c.id, c.tenantId, "package", must(favPkgs[(i * 3 + 1) % favPkgs.length], "pkg").id);
    addFav(c.id, c.tenantId, "destination", must(favDests[(i * 2) % favDests.length], "dest").id);
    if (i % 2 === 0) addFav(c.id, c.tenantId, "accommodation", must(favAccs[i % favAccs.length], "acc").id);
  }
  const enrPkgs = [...refs.enroute.packages.values()].filter((p) => p.status === "published");
  for (const [i, c] of people.customers.enroute.entries()) addFav(c.id, c.tenantId, "package", must(enrPkgs[i % enrPkgs.length], "pkg").id);
  await db.insert(schema.favorites).values(favs);

  const queries: Array<[string, Record<string, unknown> | null, string]> = [
    ["safari", null, "14"], ["diani beach", null, "3"], ["honeymoon", { type: "honeymoon" }, "2"], ["mount kenya", null, "1"], ["family", { type: "family" }, "2"],
    ["lamu", null, "2"], ["budget safari", { maxPrice: 500 }, "3"], ["cheap flights", null, "0"], ["amboseli elephants", null, "2"], ["", { featured: true }, "6"],
    ["cycling", { type: "adventure" }, "2"], ["school trip", { type: "school" }, "1"], ["corporate retreat", { type: "corporate" }, "1"], ["kilimanjaro", null, "1"],
    ["zanzibar", null, "1"], ["nairobi city tour", null, "3"], ["mombasa heritage", null, "2"], ["turtle watching", null, "1"], ["maasai mara migration", null, "4"], ["watamu", null, "2"],
  ];
  const allCustomers = [...people.customers.default, ...people.customers.enroute];
  await db.insert(schema.searchLogs).values(
    queries.map(([query, filters, resultCount], i) => ({
      userId: i % 3 === 0 ? null : allCustomers[i % allCustomers.length]!.id, query, filters, resultCount, createdAt: daysAgo(Math.floor(rng() * 30)),
    }))
  );

  // ------------------------------------------------------------- audit trail
  console.log("  - audit logs");
  const op = (key: string) => must(def.operators.get(key), `operator ${key}`);
  const audit = (tenantId: string | null, actor: string, action: string, resourceType: string, resourceId: string | null, ago: number, metadata?: Record<string, unknown>) => ({
    tenantId, actorUserId: actor, action, resourceType, resourceId, ipAddress: `203.0.113.${10 + Math.floor(rng() * 200)}`, metadata: metadata ?? null, createdAt: daysAgo(ago),
  });
  await db.insert(schema.auditLogs).values([
    audit(refs.tenants.default, superAdmin.id, "operator.approved", "operator", op("coastal").id, 200, { operator: op("coastal").name }),
    audit(refs.tenants.default, superAdmin.id, "operator.approved", "operator", op("trails").id, 195),
    audit(refs.tenants.default, superAdmin.id, "operator.approved", "operator", op("heritage").id, 190),
    audit(refs.tenants.default, superAdmin.id, "operator.approved", "operator", op("lodges").id, 188),
    audit(refs.tenants.default, superAdmin.id, "operator.approved", "operator", op("movers").id, 187),
    audit(refs.tenants.default, superAdmin.id, "operator.rejected", "operator", op("rejected").id, 120, { reason: "Incomplete licence documents" }),
    audit(refs.tenants.default, superAdmin.id, "operator.suspended", "operator", op("suspended").id, 40, { reason: "Repeated no-shows" }),
    audit(refs.tenants.default, staff("destination_manager").id, "destination.published", "destination", must(def.destinations.get("amboseli-national-park"), "dest").id, 150),
    audit(refs.tenants.default, staff("travel_manager").id, "package.published", "package", must(def.packages.get("5-day-mara-nakuru-safari"), "pkg").id, 100),
    audit(refs.tenants.default, staff("support").id, "booking.cancelled", "booking", booking("d27").id, 44, { refund: true }),
    audit(refs.tenants.default, staff("finance").id, "payment.refunded", "payment", booking("d27").paymentId ?? null, 43),
    audit(refs.tenants.default, staff("support").id, "review.removed", "review", commerce.reviewIds[commerce.reviewIds.length - 1] ?? null, 20, { reason: "Spam" }),
    audit(refs.tenants.default, superAdmin.id, "user.suspended", "user", people.customers.default[13]?.id ?? null, 35, { reason: "Chargeback abuse" }),
    audit(refs.tenants.default, staff("marketing").id, "coupon.created", "coupon", must(commerce.coupons.get(`${refs.tenants.default}:EARLYBIRD15`), "coupon"), 60),
    audit(refs.tenants.enroute, superAdmin.id, "tenant.created", "tenant", refs.tenants.enroute, 210),
    audit(refs.tenants.enroute, superAdmin.id, "plan.assigned", "tenant", refs.tenants.enroute, 209, { plan: "starter" }),
    audit(refs.tenants.enroute, staff("enroute_finance").id, "payment.refunded", "payment", booking("e06").paymentId ?? null, 25),
    audit(null, superAdmin.id, "tenant.suspended", "tenant", people.extraTenants.suspended, 14, { reason: "Unpaid invoices" }),
    audit(null, superAdmin.id, "tenant.created", "tenant", people.extraTenants.trial, 9),
  ]);

  // ----------------------------------------------------------- settings
  console.log("  - platform settings and site content");
  await db.insert(schema.systemSettings).values([
    { tenantId: null, key: "platform_commission_percent", value: 10, description: "Default platform commission (%) taken from each customer payment; tenant rows and per-operator rates override it." },
    { tenantId: null, key: "default_currency", value: "USD", description: "Currency used when a package does not specify one." },
    { tenantId: null, key: "supported_currencies", value: ["USD", "KES", "EUR", "GBP"], description: "Currencies offered at checkout." },
    { tenantId: null, key: "booking_hold_duration_minutes", value: 15, description: "How long a pending booking holds its seats (informational - the booking service currently uses a fixed value)." },
    { tenantId: null, key: "mpesa_enabled", value: true },
    { tenantId: null, key: "stripe_enabled", value: true },
    { tenantId: refs.tenants.enroute, key: "platform_commission_percent", value: 8, description: "Enroute's negotiated commission rate (Starter plan)." },
  ]);

  // Only the Enroute tenant gets customised site content. The default tenant is left on the built-in defaults on
  // purpose: tests/e2e/site-content.e2e.test.ts uses it as the untouched control for tenant isolation.
  await db.insert(schema.tenantSiteContent).values([
    {
      tenantId: refs.tenants.enroute, updatedByUserId: staff("enroute_finance").id,
      content: {
        brand: { siteName: "Enroute", tagline: "Coastal travel", footerTagline: "Slow travel on Kenya's coast." },
        seo: { title: "Enroute - Kenya coast travel", description: "Beach escapes, dhow sails and Swahili culture on the Kenyan coast." },
        about: { headline: "We know the coast", intro: "Enroute is a small coastal travel company.", paragraphs: ["Based in Mombasa, we run day trips, beach breaks and honeymoon escapes along the coast."], highlights: [{ title: "Local guides", body: "Born and raised on the coast." }] },
        contact: { email: "hello@enroute.co.ke", phone: "+254 700 000 200", address: "Mombasa, Kenya", hours: "Daily 07:00-19:00 EAT" },
      },
    },
  ]);

  // ------------------------------------------ operator onboarding records
  console.log("  - operator documents and services");
  const docs: Array<typeof schema.operatorDocuments.$inferInsert> = [];
  const services: Array<typeof schema.operatorServices.$inferInsert> = [];
  const serviceMap: Record<string, string[]> = {
    rvs: ["packages", "transport"], coastal: ["packages", "transfers"], trails: ["packages"], heritage: ["packages", "accommodation"],
    lodges: ["accommodation"], movers: ["transport", "transfers"], escapes: ["packages", "transfers"], city: ["packages"],
  };
  for (const [cat, tenantKey] of [[refs.default, "default"], [refs.enroute, "enroute"]] as const) {
    for (const o of cat.operators.values()) {
      const types = ["business_licence", "tax_certificate", "insurance"];
      types.forEach((t, i) => {
        const status = o.status === "approved" ? (o.key === "city" && t === "insurance" ? "pending" : "approved") : o.status === "rejected" ? "rejected" : "pending";
        docs.push({
          operatorId: o.id, documentType: t, storageKey: `operators/${o.id}/${t}.pdf`, status,
          reviewedByUserId: status === "pending" ? null : superAdmin.id, createdAt: daysAgo(210 - i),
        });
      });
      for (const s of serviceMap[o.key] ?? ["packages"]) services.push({ operatorId: o.id, serviceType: s, metadata: { tenant: tenantKey, note: "Demo service entry" } });
    }
  }
  await db.insert(schema.operatorDocuments).values(docs);
  await db.insert(schema.operatorServices).values(services);

  // ------------------------------------------------------------ billing events
  await db.insert(schema.billingEvents).values([
    { eventId: "evt_seed_sub_created", type: "customer.subscription.created", tenantId: refs.tenants.enroute, outcome: "applied", payload: { note: "Demo event - Stripe was never contacted." }, processedAt: daysAgo(209), createdAt: daysAgo(209) },
    { eventId: "evt_seed_invoice_paid", type: "invoice.paid", tenantId: refs.tenants.enroute, outcome: "applied", payload: { note: "Demo event - Stripe was never contacted." }, processedAt: daysAgo(179), createdAt: daysAgo(179) },
    { eventId: "evt_seed_invoice_failed", type: "invoice.payment_failed", tenantId: people.extraTenants.suspended, outcome: "applied", payload: { note: "Demo event - Stripe was never contacted." }, processedAt: daysAgo(20), createdAt: daysAgo(20) },
  ]);
}
