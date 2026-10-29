import "../load-env.js";
import { createDb, eq, schema } from "../client.js";
import { hashPassword } from "@travel/auth";

/**
 * Demo/dev seed data. Uses clearly fictional operators and
 * payment information as instructed. Idempotent-ish: re-running
 * will error on unique constraints rather than silently
 * duplicating rows - that's intentional so seeding accidents are
 * loud, not silent.
 */
async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is required to seed");
    process.exit(1);
  }
  const db = createDb(connectionString);

  console.log("Seeding the default tenant...");
  // Every tenant-scoped table's tenant_id column defaults to this row's
  // id (see packages/database/src/schema/_helpers.ts) - it MUST exist
  // before any other insert below, or every one of those inserts would
  // fail its tenant_id foreign key. Explicit id (not the column default)
  // so it matches DEFAULT_TENANT_ID exactly, the same sentinel every
  // migration/backfill and the notification-template fallback use.
  await db.insert(schema.tenants).values({
    id: schema.DEFAULT_TENANT_ID,
    name: "Default (Demo)",
    slug: schema.DEFAULT_TENANT_SLUG,
    status: "active",
  });

  console.log("Seeding roles & permissions...");
  const roleRows = await db
    .insert(schema.roles)
    .values(
      [
        "super_admin",
        "admin",
        "travel_manager",
        "destination_manager",
        "tour_operator",
        "accommodation_provider",
        "transport_provider",
        "tour_guide",
        "finance_manager",
        "customer_support",
        "marketing_manager",
        "customer",
      ].map((name) => ({ name }))
    )
    .returning();

  const permissionCodes = [
    "destination:create",
    "destination:update",
    "destination:delete",
    "booking:view",
    "booking:cancel",
    "payment:view",
    "payment:refund",
    "user:manage",
    "report:view",
    "support:manage",
  ];
  const permissionRows = await db
    .insert(schema.permissions)
    .values(permissionCodes.map((code) => ({ code })))
    .returning();

  const superAdmin = roleRows.find((r) => r.name === "super_admin")!;
  await db.insert(schema.rolePermissions).values(
    permissionRows.map((p) => ({ roleId: superAdmin.id, permissionId: p.id }))
  );

  console.log("Seeding countries/regions/cities...");
  const [kenya, tanzania, uganda, rwanda, southAfrica, uae, egypt] = await db
    .insert(schema.countries)
    .values([
      { isoCode: "KE", name: "Kenya" },
      { isoCode: "TZ", name: "Tanzania" },
      { isoCode: "UG", name: "Uganda" },
      { isoCode: "RW", name: "Rwanda" },
      { isoCode: "ZA", name: "South Africa" },
      { isoCode: "AE", name: "United Arab Emirates" },
      { isoCode: "EG", name: "Egypt" },
    ])
    .returning();

  const [rift, coast, nairobiRegion, arusha, zanzibarRegion] = await db
    .insert(schema.regions)
    .values([
      { countryId: kenya!.id, name: "Rift Valley" },
      { countryId: kenya!.id, name: "Coast" },
      { countryId: kenya!.id, name: "Nairobi" },
      { countryId: tanzania!.id, name: "Arusha" },
      { countryId: tanzania!.id, name: "Zanzibar" },
    ])
    .returning();

  const cities = await db
    .insert(schema.cities)
    .values([
      { regionId: nairobiRegion!.id, name: "Nairobi", latitude: -1.286389, longitude: 36.817223 },
      { regionId: rift!.id, name: "Narok (Maasai Mara)", latitude: -1.4061, longitude: 35.0144 },
      { regionId: rift!.id, name: "Naivasha", latitude: -0.7167, longitude: 36.4333 },
      { regionId: coast!.id, name: "Diani", latitude: -4.3167, longitude: 39.5667 },
      { regionId: coast!.id, name: "Malindi", latitude: -3.2138, longitude: 40.1169 },
      { regionId: arusha!.id, name: "Serengeti", latitude: -2.3333, longitude: 34.8333 },
      { regionId: zanzibarRegion!.id, name: "Zanzibar City", latitude: -6.1659, longitude: 39.2026 },
    ])
    .returning();

  console.log("Seeding destination categories...");
  const categories = await db
    .insert(schema.destinationCategories)
    .values([
      { name: "National Parks & Wildlife", slug: "wildlife-nature" },
      { name: "Beaches & Coastal", slug: "beaches-coastal" },
      { name: "Adventure", slug: "adventure" },
      { name: "Culture & History", slug: "culture-history" },
      { name: "Agricultural & Rural Tourism", slug: "agri-rural" },
      { name: "Entertainment & Lifestyle", slug: "entertainment-lifestyle" },
    ])
    .returning();

  console.log("Seeding a demo operator...");
  const [demoOperator] = await db
    .insert(schema.operators)
    .values([
      {
        businessName: "Rift Valley Safaris (Demo)",
        slug: "rift-valley-safaris-demo",
        status: "approved",
        contactEmail: "ops@example-riftvalley-demo.test",
        contactPhone: "+254700000000",
        countryId: kenya!.id,
        description: "Fictional demo operator used for seed/dev data only.",
      },
    ])
    .returning();

  console.log("Seeding sample destinations...");
  const wildlife = categories.find((c) => c.slug === "wildlife-nature")!;
  const beaches = categories.find((c) => c.slug === "beaches-coastal")!;
  const maasaiMaraCity = cities.find((c) => c.name.includes("Maasai Mara"))!;
  const dianiCity = cities.find((c) => c.name === "Diani")!;

  const [maasaiMaraDestination, dianiDestination] = await db
    .insert(schema.destinations)
    .values([
      {
        cityId: maasaiMaraCity.id,
        categoryId: wildlife.id,
        name: "Maasai Mara National Reserve",
        slug: "maasai-mara-national-reserve",
        shortDescription: "World-famous for the Great Migration and Big Five game viewing.",
        description: "Demo seed content - replace with real editorial copy.",
        status: "published",
        featured: true,
        verified: true,
        bestTimeToVisit: "July to October (Great Migration)",
      },
      {
        cityId: dianiCity.id,
        categoryId: beaches.id,
        name: "Diani Beach",
        slug: "diani-beach",
        shortDescription: "White-sand beach on Kenya's south coast, popular for kite-surfing.",
        description: "Demo seed content - replace with real editorial copy.",
        status: "published",
        featured: true,
        verified: true,
        bestTimeToVisit: "December to March",
      },
    ])
    .returning();

  console.log("Seeding vehicle types...");
  await db.insert(schema.vehicleTypes).values([
    { code: "private_car", name: "Private Car", defaultCapacity: 3 },
    { code: "suv", name: "SUV", defaultCapacity: 5 },
    { code: "van", name: "Van", defaultCapacity: 8 },
    { code: "minibus", name: "Minibus", defaultCapacity: 14 },
    { code: "tour_bus", name: "Tour Bus", defaultCapacity: 45 },
    { code: "4x4_safari_vehicle", name: "4x4 Safari Vehicle", defaultCapacity: 6 },
  ]);

  console.log("Seeding notification templates...");
  await db.insert(schema.notificationTemplates).values([
    {
      key: "booking.created",
      channel: "email",
      locale: "en",
      subject: "We've received your booking - {{bookingId}}",
      bodyTemplate:
        "<p>Thanks for booking with us! Your trip for {{travelDate}} is reserved and pending payment.</p><p>Total due: {{currency}} {{totalAmount}}.</p><p>Booking reference: {{bookingId}}</p>",
    },
    {
      key: "payment.completed",
      channel: "email",
      locale: "en",
      subject: "Payment received - booking {{bookingId}} confirmed",
      bodyTemplate:
        "<p>We've received your payment of {{currency}} {{amount}}. Your booking {{bookingId}} is now confirmed. We can't wait to host you!</p>",
    },
    {
      key: "booking.confirmed",
      channel: "sms",
      locale: "en",
      bodyTemplate: "Booking {{bookingId}} confirmed! Check your email for details. Safe travels.",
    },
    {
      key: "payment.failed",
      channel: "email",
      locale: "en",
      subject: "There was a problem with your payment - booking {{bookingId}}",
      bodyTemplate:
        "<p>We couldn't process your payment for booking {{bookingId}} ({{reason}}). Please try again or contact support.</p>",
    },
    {
      key: "booking.cancelled",
      channel: "email",
      locale: "en",
      subject: "Booking {{bookingId}} cancelled",
      bodyTemplate:
        "<p>Your booking {{bookingId}} has been cancelled. Refund amount: {{currency}} {{refundAmount}}, which will be processed shortly if applicable.</p>",
    },
    {
      key: "refund.completed",
      channel: "email",
      locale: "en",
      subject: "Refund processed - booking {{bookingId}}",
      bodyTemplate: "<p>Your refund of {{currency}} {{amount}} for booking {{bookingId}} has been processed.</p>",
    },
    {
      key: "trip.reminder",
      channel: "email",
      locale: "en",
      subject: "{{daysBeforeTrip}} days until your trip",
      bodyTemplate:
        "<p>Just a reminder - your trip on {{travelDate}} is {{daysBeforeTrip}} day(s) away. Check your booking for the full itinerary.</p>",
    },
    {
      key: "trip.reminder",
      channel: "sms",
      locale: "en",
      bodyTemplate: "Reminder: your trip is {{daysBeforeTrip}} day(s) away. Safe travels!",
    },
    {
      key: "operator.approved",
      channel: "email",
      locale: "en",
      subject: "{{businessName}} is approved - you're live on NaviMus",
      bodyTemplate:
        "<p>Congratulations - {{businessName}} has been approved. You can now publish packages, accommodation, and transport listings.</p>",
    },
    {
      key: "operator.rejected",
      channel: "email",
      locale: "en",
      subject: "Update on your {{businessName}} application",
      bodyTemplate:
        "<p>We were unable to approve {{businessName}} at this time. Reason: {{reason}}. Reply to this email if you'd like to resubmit.</p>",
    },
    {
      key: "user.password_reset_requested",
      channel: "email",
      locale: "en",
      subject: "Reset your password",
      bodyTemplate:
        "<p>We received a request to reset your password. This link expires at {{expiresAt}}:</p><p>{{resetUrl}}</p><p>If you didn't request this, you can safely ignore this email.</p>",
    },
    {
      key: "user.email_verification_requested",
      channel: "email",
      locale: "en",
      subject: "Verify your email",
      bodyTemplate:
        "<p>Welcome! Please confirm your email address by {{expiresAt}}:</p><p>{{verificationUrl}}</p>",
    },
  ]);

  console.log("Seeding test accounts (fictional credentials, dev/CI only)...");
  const testPasswordHash = await hashPassword("Test-Passw0rd!");

  const [testAdmin, testOperatorUser, testCustomer] = await db
    .insert(schema.users)
    .values([
      {
        email: "admin@example-travel-demo.test",
        passwordHash: testPasswordHash,
        firstName: "Demo",
        lastName: "Admin",
        status: "active",
      },
      {
        email: "operator@example-travel-demo.test",
        passwordHash: testPasswordHash,
        firstName: "Demo",
        lastName: "Operator",
        status: "active",
      },
      {
        email: "customer@example-travel-demo.test",
        passwordHash: testPasswordHash,
        firstName: "Demo",
        lastName: "Customer",
        status: "active",
      },
    ])
    .returning();

  const superAdminRole = roleRows.find((r) => r.name === "super_admin")!;
  const tourOperatorRole = roleRows.find((r) => r.name === "tour_operator")!;
  const customerRole = roleRows.find((r) => r.name === "customer")!;

  await db.insert(schema.userRoles).values([
    { userId: testAdmin!.id, roleId: superAdminRole.id },
    { userId: testOperatorUser!.id, roleId: tourOperatorRole.id },
    { userId: testCustomer!.id, roleId: customerRole.id },
  ]);

  // Link the operator test user as staff of the demo operator so
  // "operator@example-travel-demo.test" can sign into the Partner
  // Portal and see the demo operator's own packages/bookings/earnings.
  await db.insert(schema.operatorUsers).values({
    operatorId: demoOperator!.id,
    userId: testOperatorUser!.id,
    title: "Owner",
  });

  console.log("Seeding a bookable demo package...");
  const [demoPackage] = await db
    .insert(schema.packages)
    .values({
      operatorId: demoOperator!.id,
      name: "3-Day Maasai Mara Safari (Demo)",
      slug: "3-day-maasai-mara-safari-demo",
      type: "safari",
      shortDescription: "A classic introduction to the Mara - game drives and a sundowner.",
      description: "Demo seed content - replace with real editorial copy.",
      durationDays: 3,
      minGroupSize: 1,
      maxGroupSize: 12,
      baseCurrency: "USD",
      status: "published",
      featured: true,
      publishedAt: new Date(),
    })
    .returning();

  await db.insert(schema.packageDestinations).values({
    packageId: demoPackage!.id,
    destinationId: maasaiMaraDestination!.id,
    sequenceOrder: 0,
  });

  await db.insert(schema.packageItineraries).values([
    { packageId: demoPackage!.id, dayNumber: 1, title: "Arrival & afternoon game drive" },
    { packageId: demoPackage!.id, dayNumber: 2, title: "Full-day game drive with picnic lunch" },
    { packageId: demoPackage!.id, dayNumber: 3, title: "Morning game drive & departure" },
  ]);

  await db.insert(schema.packagePrices).values([
    { packageId: demoPackage!.id, travelerType: "adult", pricingType: "individual", amount: "650.00", currency: "USD" },
    { packageId: demoPackage!.id, travelerType: "child", pricingType: "individual", amount: "400.00", currency: "USD" },
  ]);

  await db.insert(schema.packageInclusions).values([
    { packageId: demoPackage!.id, label: "Park entry fees" },
    { packageId: demoPackage!.id, label: "All meals" },
    { packageId: demoPackage!.id, label: "4x4 safari vehicle with driver-guide" },
  ]);
  await db.insert(schema.packageExclusions).values([{ packageId: demoPackage!.id, label: "International flights" }]);

  // Availability for the next 90 days so e2e tests (and manual QA) always
  // have a bookable near-future date regardless of when seeding runs.
  const availabilityRows = Array.from({ length: 90 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() + i + 1);
    return {
      packageId: demoPackage!.id,
      travelDate: date.toISOString().slice(0, 10),
      totalCapacity: 12,
      status: "open" as const,
    };
  });
  await db.insert(schema.packageAvailability).values(availabilityRows);

  console.log(`Seed complete. Operator id: ${demoOperator!.id}, demo package id: ${demoPackage!.id}`);

  // --- Plans (spec: multi-tenancy Phase 5 billing) - shared platform
  // reference data, not tenant-scoped, per plans.ts's schema comment.
  console.log("Seeding plans...");
  const [, starterPlan, growthPlan] = await db
    .insert(schema.plans)
    .values([
      {
        code: "free",
        name: "Free",
        description: "For trying things out - one operator, a small team, limited monthly bookings.",
        monthlyPriceUsd: "0.00",
        maxOperators: 1,
        maxStaffUsers: 3,
        maxBookingsPerMonth: 25,
      },
      {
        code: "starter",
        name: "Starter",
        description: "For a single growing business.",
        monthlyPriceUsd: "49.00",
        maxOperators: 3,
        maxStaffUsers: 10,
        maxBookingsPerMonth: 250,
        commissionRatePercent: "8.00",
      },
      {
        code: "growth",
        name: "Growth",
        description: "For a multi-operator marketplace.",
        monthlyPriceUsd: "199.00",
        maxOperators: 25,
        maxStaffUsers: 50,
        maxBookingsPerMonth: 2500,
        commissionRatePercent: "6.00",
      },
      {
        code: "enterprise",
        name: "Enterprise",
        description: "Unlimited operators, staff, and bookings, with a negotiated commission rate.",
        monthlyPriceUsd: "0.00", // custom pricing, negotiated directly - not self-serve
        maxOperators: null,
        maxStaffUsers: null,
        maxBookingsPerMonth: null,
      },
    ])
    .returning();

  // The default (demo) tenant gets Growth so the seeded demo data isn't
  // immediately shown as over a stricter tier's limit.
  await db.update(schema.tenants).set({ planId: growthPlan!.id }).where(eq(schema.tenants.id, schema.DEFAULT_TENANT_ID));

  // --- A second tenant, seeded end-to-end, so multi-tenancy isolation is
  // demonstrable out of the box rather than only provable by creating one
  // yourself via POST /api/v1/platform/tenants. Deliberately reuses the
  // same shared geography (countries/regions/cities) and role
  // definitions - those are global platform reference data, not
  // per-tenant (see Phase 1's schema notes) - but gets its own
  // destination category, operator, destination, package, and admin
  // user, all under a different tenant_id. Querying either tenant's
  // catalog/bookings should never surface the other's data.
  console.log("Seeding a second tenant, to demonstrate isolation...");
  const [secondTenant] = await db
    .insert(schema.tenants)
    .values({ name: "Acme Travel Co (Demo)", slug: "acme-travel-demo", status: "active", planId: starterPlan!.id })
    .returning();

  const [acmeCategory] = await db
    .insert(schema.destinationCategories)
    .values({ tenantId: secondTenant!.id, name: "Beaches & Coastal", slug: "beaches-coastal" })
    .returning();

  const [acmeOperator] = await db
    .insert(schema.operators)
    .values({
      tenantId: secondTenant!.id,
      businessName: "Acme Coastal Escapes (Demo)",
      slug: "acme-coastal-escapes-demo",
      status: "approved",
      contactEmail: "ops@example-acme-demo.test",
      countryId: kenya!.id,
      description: "Fictional demo operator for the second seeded tenant, used to prove tenant isolation.",
    })
    .returning();

  const [acmeDestination] = await db
    .insert(schema.destinations)
    .values({
      tenantId: secondTenant!.id,
      cityId: dianiCity.id, // shared geography - same real city, different tenant's own destination listing for it
      categoryId: acmeCategory!.id,
      name: "Diani Beach",
      slug: "diani-beach", // safe to reuse - destinations' unique index is (tenantId, cityId, slug), scoped per tenant
      shortDescription: "Acme's own Diani Beach listing - separate from the default tenant's.",
      description: "Demo seed content - replace with real editorial copy.",
      status: "published",
      verified: true,
    })
    .returning();

  const [acmePackage] = await db
    .insert(schema.packages)
    .values({
      tenantId: secondTenant!.id,
      operatorId: acmeOperator!.id,
      name: "Diani Beach Weekend Getaway (Demo)",
      slug: "diani-beach-weekend-getaway-demo",
      type: "beach_holiday",
      shortDescription: "A relaxed weekend on Kenya's south coast.",
      description: "Demo seed content - replace with real editorial copy.",
      durationDays: 3,
      minGroupSize: 1,
      maxGroupSize: 8,
      baseCurrency: "USD",
      status: "published",
      publishedAt: new Date(),
    })
    .returning();

  await db.insert(schema.packageDestinations).values({
    packageId: acmePackage!.id,
    destinationId: acmeDestination!.id,
    sequenceOrder: 0,
  });
  await db.insert(schema.packagePrices).values([
    { packageId: acmePackage!.id, travelerType: "adult", pricingType: "individual", amount: "420.00", currency: "USD" },
  ]);

  const [acmeAdmin] = await db
    .insert(schema.users)
    .values({
      tenantId: secondTenant!.id,
      email: "admin@example-acme-demo.test",
      passwordHash: testPasswordHash,
      firstName: "Acme",
      lastName: "Admin",
      status: "active",
    })
    .returning();
  const adminRole = roleRows.find((r) => r.name === "admin")!;
  await db.insert(schema.userRoles).values({ userId: acmeAdmin!.id, roleId: adminRole.id });
  await db.update(schema.tenants).set({ ownerUserId: acmeAdmin!.id }).where(eq(schema.tenants.id, secondTenant!.id));

  // A couple of Acme-specific templates, deliberately different in tone
  // and branding from the default tenant's - this is what proves the
  // notification-template resolution actually works per tenant (see
  // services/notifications/src/templates.ts's own-tenant -> default-
  // tenant fallback): Acme customers get Acme's own copy for these two
  // keys, and silently fall back to the default tenant's copy for every
  // other template Acme hasn't customized (payment.failed,
  // booking.cancelled, refund.completed, etc.) - both behaviors are
  // demonstrated by seeding only a subset here, not the full set.
  console.log("Seeding Acme-specific notification templates (demonstrating per-tenant customization)...");
  await db.insert(schema.notificationTemplates).values([
    {
      tenantId: secondTenant!.id,
      key: "booking.created",
      channel: "email",
      locale: "en",
      subject: "Your Acme Coastal Escapes booking is in! - {{bookingId}}",
      bodyTemplate:
        "<p>Karibu! Your Diani getaway for {{travelDate}} is reserved with Acme Coastal Escapes and pending payment.</p><p>Total due: {{currency}} {{totalAmount}}.</p><p>Booking reference: {{bookingId}}</p>",
    },
    {
      tenantId: secondTenant!.id,
      key: "booking.confirmed",
      channel: "sms",
      locale: "en",
      bodyTemplate: "Acme Coastal Escapes: booking {{bookingId}} confirmed! See you on the coast.",
    },
  ]);

  console.log("Test accounts (password for all: Test-Passw0rd!):");
  console.log("  admin@example-travel-demo.test    - super_admin (default tenant, but crosses every tenant)");
  console.log("  operator@example-travel-demo.test - tour_operator, staff of the demo operator (default tenant)");
  console.log("  customer@example-travel-demo.test - customer (default tenant)");
  console.log("  admin@example-acme-demo.test      - admin, owner of the second seeded tenant (Acme Travel Co)");
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
