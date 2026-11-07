import { eq, schema, sql } from "../../client.js";
import {
  DEFAULT_ACCOMMODATIONS, DEFAULT_DESTINATIONS, DEFAULT_LOCATIONS, DEFAULT_OPERATORS, DEFAULT_PACKAGES, DEFAULT_PROVIDERS,
  DEFAULT_ROUTES, DEFAULT_TRANSFERS, DEFAULT_VEHICLES, ENROUTE_ACCOMMODATIONS, ENROUTE_CATEGORIES, ENROUTE_DESTINATIONS,
  ENROUTE_LOCATIONS, ENROUTE_OPERATORS, ENROUTE_PACKAGES, ENROUTE_PROVIDERS, ENROUTE_ROUTES, ENROUTE_TRANSFERS,
  ENROUTE_VEHICLES, EXTRA_CITIES, EXTRA_REGIONS, POLICY_TEMPLATES, type AccomSpec, type DestSpec, type LocationSpec,
  type OperatorSpec, type PkgSpec, type PolicyKind, type ProviderSpec, type RouteSpec, type TransferSpec, type VehicleSpec,
} from "./catalog-data.js";
import { daysFromNow, isoDay, makeRng, money, must, type Db } from "./helpers.js";

export interface OperatorRef { id: string; tenantId: string; key: string; name: string; status: string; commission: number }
export interface PackageRef {
  id: string; tenantId: string; operatorId: string; operatorKey: string; slug: string; name: string; currency: string;
  days: number; adult: number; child: number; infant: number; capacity: number; status: string; type: string;
  policies: Record<PolicyKind, string> | undefined; policyId: string | null; destinationId: string | null;
}
export interface AccomRef { id: string; tenantId: string; operatorId: string; name: string; cityId: string; rooms: Map<string, { id: string; price: number; name: string }> }
export interface RouteRef { id: string; tenantId: string; provider: string; price: number; currency: string; vehicleTypeId: string }

export interface TenantCatalog {
  tenantId: string;
  operators: Map<string, OperatorRef>;
  destinations: Map<string, { id: string; name: string; cityId: string }>;
  packages: Map<string, PackageRef>;
  accommodations: Map<string, AccomRef>;
  routes: Map<string, RouteRef>;
  locations: Map<string, string>;
  transfers: Array<{ id: string; pickup: string; dropoff: string; price: number; currency: string }>;
  policies: Map<string, Record<PolicyKind, string>>; // operator key -> policy ids
  vehicles: Map<string, string[]>; // provider key -> vehicle ids
}

export interface CatalogRefs {
  cities: Map<string, { id: string }>;
  countries: Map<string, string>;
  tenants: { default: string; enroute: string };
  default: TenantCatalog;
  enroute: TenantCatalog;
}

/** Adds the extra regions/cities the expanded catalog needs, and returns lookup maps. */
async function seedGeographyExtras(db: Db) {
  const countries = await db.select().from(schema.countries);
  const countryByIso = new Map(countries.map((c) => [c.isoCode, c.id]));

  await db
    .insert(schema.regions)
    .values(EXTRA_REGIONS.map(([iso, name]) => ({ countryId: must(countryByIso.get(iso), `country ${iso}`), name })));

  const allRegions = await db.select().from(schema.regions);
  const isoById = new Map(countries.map((c) => [c.id, c.isoCode]));
  const regionKey = new Map(allRegions.map((r) => [`${isoById.get(r.countryId)}:${r.name}`, r.id]));

  await db.insert(schema.cities).values(
    EXTRA_CITIES.map(([key, name, latitude, longitude]) => ({
      regionId: must(regionKey.get(key), `region ${key}`), name, latitude, longitude,
    }))
  );

  const cities = await db.select().from(schema.cities);
  return { countryByIso, cities: new Map(cities.map((c) => [c.name, { id: c.id }])) };
}

function emptyCatalog(tenantId: string): TenantCatalog {
  return {
    tenantId, operators: new Map(), destinations: new Map(), packages: new Map(), accommodations: new Map(), routes: new Map(),
    locations: new Map(), transfers: [], policies: new Map(), vehicles: new Map(),
  };
}

async function createOperators(db: Db, cat: TenantCatalog, specs: OperatorSpec[], countryByIso: Map<string, string>, approverId: string | null) {
  const rows = await db
    .insert(schema.operators)
    .values(
      specs.map((s) => ({
        tenantId: cat.tenantId, businessName: s.name, slug: s.slug, status: s.status, contactEmail: s.email, contactPhone: s.phone,
        countryId: countryByIso.get(s.country), description: s.description, commissionRatePercent: s.commission,
        approvedByUserId: s.status === "approved" ? approverId : null, approvedAt: s.status === "approved" ? new Date() : null,
      }))
    )
    .returning();
  rows.forEach((r, i) => {
    const s = must(specs[i], "operator spec");
    cat.operators.set(s.key, { id: r.id, tenantId: cat.tenantId, key: s.key, name: s.name, status: s.status, commission: Number(s.commission) });
  });
}

async function createPolicies(db: Db, cat: TenantCatalog, operatorKeys: string[]) {
  for (const key of operatorKeys) {
    const op = must(cat.operators.get(key), `operator ${key}`);
    const kinds = Object.keys(POLICY_TEMPLATES) as PolicyKind[];
    const policies = await db
      .insert(schema.cancellationPolicies)
      .values(kinds.map((k) => ({ tenantId: cat.tenantId, operatorId: op.id, name: `${POLICY_TEMPLATES[k].name} policy` })))
      .returning();
    const ids = {} as Record<PolicyKind, string>;
    for (const [i, kind] of kinds.entries()) {
      const policy = must(policies[i], "policy");
      ids[kind] = policy.id;
      await db.insert(schema.cancellationRules).values(
        POLICY_TEMPLATES[kind].rules.map(([min, max, refund, penalty]) => ({
          policyId: policy.id, daysBeforeMin: min, daysBeforeMax: max, refundPercentage: money(refund), penaltyPercentage: money(penalty),
        }))
      );
    }
    cat.policies.set(key, ids);
  }
}

async function createDestinations(db: Db, cat: TenantCatalog, specs: DestSpec[], cities: Map<string, { id: string }>, categories: Map<string, string>) {
  const rows = await db
    .insert(schema.destinations)
    .values(
      specs.map((s) => ({
        tenantId: cat.tenantId, cityId: must(cities.get(s.city), `city ${s.city}`).id, categoryId: must(categories.get(s.category), `category ${s.category}`),
        name: s.name, slug: s.slug, shortDescription: s.short, description: s.description, status: s.status ?? "published",
        featured: s.featured ?? false, verified: (s.status ?? "published") === "published", bestTimeToVisit: s.bestTime,
        minimumAge: s.minimumAge, maximumCapacity: s.capacity, averageDurationHours: s.hours ?? 6, timezone: "Africa/Nairobi",
        publishedAt: (s.status ?? "published") === "published" ? new Date() : null,
        seoTitle: `${s.name} - travel guide`, seoDescription: s.short,
      }))
    )
    .returning();
  for (const [i, row] of rows.entries()) {
    const s = must(specs[i], "destination spec");
    cat.destinations.set(s.slug, { id: row.id, name: s.name, cityId: row.cityId });
    await db.insert(schema.destinationAmenities).values(s.amenities.map((name) => ({ destinationId: row.id, name })));
    await db.insert(schema.destinationActivities).values(s.activities.map(([name, description]) => ({ destinationId: row.id, name, description })));
  }
}

async function createAccommodations(db: Db, cat: TenantCatalog, specs: AccomSpec[], cities: Map<string, { id: string }>) {
  for (const s of specs) {
    const op = must(cat.operators.get(s.operator), `operator ${s.operator}`);
    const cityId = must(cities.get(s.city), `city ${s.city}`).id;
    const policyId = cat.policies.get(s.operator)?.flexible ?? null;
    const [acc] = await db
      .insert(schema.accommodations)
      .values({
        tenantId: cat.tenantId, operatorId: op.id, cityId, name: s.name, slug: s.slug, type: s.type, description: s.description,
        starRating: s.stars, amenities: s.amenities, checkInTime: s.checkIn, checkOutTime: s.checkOut, cancellationPolicyId: policyId,
        status: s.status ?? "published",
      })
      .returning();
    const ref: AccomRef = { id: acc!.id, tenantId: cat.tenantId, operatorId: op.id, name: s.name, cityId, rooms: new Map() };
    for (const r of s.rooms) {
      const [rt] = await db
        .insert(schema.roomTypes)
        .values({ accommodationId: acc!.id, name: r.name, maxOccupancy: r.occupancy, basePricePerNight: money(r.price), currency: "USD", mealPlan: r.meal })
        .returning();
      await db.insert(schema.rooms).values(
        Array.from({ length: r.count }, (_, i) => ({ roomTypeId: rt!.id, roomNumber: `${r.name.slice(0, 1).toUpperCase()}${101 + i}` }))
      );
      ref.rooms.set(r.name, { id: rt!.id, price: r.price, name: r.name });
    }
    cat.accommodations.set(s.key, ref);
  }
}

async function createTransport(
  db: Db, cat: TenantCatalog, providers: ProviderSpec[], vehicles: VehicleSpec[], routes: RouteSpec[],
  cities: Map<string, { id: string }>, vehicleTypes: Map<string, string>
) {
  const providerIds = new Map<string, string>();
  for (const p of providers) {
    const op = must(cat.operators.get(p.operator), `operator ${p.operator}`);
    const [row] = await db
      .insert(schema.transportProviders)
      .values({ tenantId: cat.tenantId, operatorId: op.id, name: p.name, contactPhone: p.phone })
      .returning();
    providerIds.set(p.key, row!.id);
  }
  for (const v of vehicles) {
    const [row] = await db
      .insert(schema.vehicles)
      .values({
        transportProviderId: must(providerIds.get(v.provider), "provider"), vehicleTypeId: must(vehicleTypes.get(v.type), `vehicle type ${v.type}`),
        name: v.name, registrationNumber: v.reg, capacity: v.capacity,
      })
      .returning();
    cat.vehicles.set(v.provider, [...(cat.vehicles.get(v.provider) ?? []), row!.id]);
  }
  for (const r of routes) {
    const vehicleTypeId = must(vehicleTypes.get(r.vehicle), `vehicle type ${r.vehicle}`);
    const [row] = await db
      .insert(schema.transportRoutes)
      .values({
        transportProviderId: must(providerIds.get(r.provider), "provider"), originCityId: must(cities.get(r.from), r.from).id,
        destinationCityId: must(cities.get(r.to), r.to).id, vehicleTypeId, basePrice: money(r.price), currency: r.currency ?? "USD",
        estimatedDurationMinutes: r.minutes,
      })
      .returning();
    cat.routes.set(r.key, { id: row!.id, tenantId: cat.tenantId, provider: r.provider, price: r.price, currency: r.currency ?? "USD", vehicleTypeId });
  }
}

async function createTransfers(db: Db, cat: TenantCatalog, locations: LocationSpec[], transfers: TransferSpec[], cities: Map<string, { id: string }>) {
  for (const l of locations) {
    const [row] = await db
      .insert(schema.transferLocations)
      .values({ tenantId: cat.tenantId, cityId: must(cities.get(l.city), l.city).id, name: l.name, type: l.type, address: l.address })
      .returning();
    cat.locations.set(l.key, row!.id);
  }
  for (const t of transfers) {
    const [row] = await db
      .insert(schema.airportTransfers)
      .values({
        tenantId: cat.tenantId, pickupLocationId: must(cat.locations.get(t.pickup), t.pickup), dropoffLocationId: must(cat.locations.get(t.dropoff), t.dropoff),
        transferType: t.type, direction: t.direction, basePrice: money(t.price), currency: t.currency ?? "USD", meetAndGreet: t.meetAndGreet ?? false,
      })
      .returning();
    cat.transfers.push({ id: row!.id, pickup: t.pickup, dropoff: t.dropoff, price: t.price, currency: t.currency ?? "USD" });
  }
}

/** Season dates like "07-01".."10-31" (or a year-wrapping "12-15".."01-15") for the current and next year. */
function seasonWindows(start: string, end: string): Array<[string, string]> {
  const y = new Date().getUTCFullYear();
  const wraps = start > end;
  return [y - 1, y, y + 1].map((year) => [`${year}-${start}`, `${wraps ? year + 1 : year}-${end}`] as [string, string]);
}

async function createPackages(db: Db, cat: TenantCatalog, specs: PkgSpec[]) {
  const rng = makeRng(cat.tenantId.charCodeAt(cat.tenantId.length - 1) * 7919);
  for (const s of specs) {
    const op = must(cat.operators.get(s.operator), `operator ${s.operator}`);
    const policies = cat.policies.get(s.operator);
    const policyId = policies ? policies[s.policy] : null;
    const status = s.status ?? "published";
    const [pkg] = await db
      .insert(schema.packages)
      .values({
        tenantId: cat.tenantId, operatorId: op.id, name: s.name, slug: s.slug, type: s.type, description: s.description, shortDescription: s.short,
        durationDays: s.days, minGroupSize: s.min, maxGroupSize: s.max, baseCurrency: s.currency, inclusions: s.inclusions.join("\n"),
        exclusions: s.exclusions.join("\n"), cancellationPolicyId: policyId, status, featured: s.featured ?? false,
        termsAndConditions: "Demo terms: bookings are subject to the operator's cancellation policy. Replace with real terms.",
        visaInformation: "Most visitors need an eTA for Kenya - check requirements before travel.",
        insuranceInformation: "Comprehensive travel insurance is strongly recommended.",
        seoTitle: s.name, seoDescription: s.short, publishedAt: status === "published" ? new Date(Date.now() - 30 * 86400000) : null,
      })
      .returning();
    const pkgId = pkg!.id;
    const destIds = s.destinations.map((d) => must(cat.destinations.get(d), `destination ${d}`).id);
    await db.insert(schema.packageDestinations).values(destIds.map((destinationId, i) => ({ packageId: pkgId, destinationId, sequenceOrder: i })));
    await db.insert(schema.packageItineraries).values(s.itinerary.map(([title, description], i) => ({ packageId: pkgId, dayNumber: i + 1, title, description })));
    await db.insert(schema.packageInclusions).values(s.inclusions.map((label) => ({ packageId: pkgId, label })));
    await db.insert(schema.packageExclusions).values(s.exclusions.map((label) => ({ packageId: pkgId, label })));
    if (s.activities?.length) {
      await db.insert(schema.packageActivities).values(
        s.activities.map(([name, description, price]) => ({
          packageId: pkgId, name, description, isOptional: true, additionalPrice: price === null ? null : money(price), currency: price === null ? null : s.currency,
        }))
      );
    }

    const prices: Array<typeof schema.packagePrices.$inferInsert> = [
      { packageId: pkgId, travelerType: "adult", pricingType: "individual", amount: money(s.adult), currency: s.currency },
    ];
    if (s.child !== undefined) prices.push({ packageId: pkgId, travelerType: "child", pricingType: "individual", amount: money(s.child), currency: s.currency });
    if (s.infant !== undefined) prices.push({ packageId: pkgId, travelerType: "infant", pricingType: "individual", amount: money(s.infant), currency: s.currency });
    if (s.season) {
      for (const [start, end] of seasonWindows(s.season.start, s.season.end)) {
        prices.push({ packageId: pkgId, travelerType: "adult", pricingType: "individual", seasonLabel: s.season.label, seasonStartDate: start, seasonEndDate: end, amount: money(s.season.adult), currency: s.currency });
        if (s.season.child !== undefined) {
          prices.push({ packageId: pkgId, travelerType: "child", pricingType: "individual", seasonLabel: s.season.label, seasonStartDate: start, seasonEndDate: end, amount: money(s.season.child), currency: s.currency });
        }
      }
    }
    await db.insert(schema.packagePrices).values(prices);

    if (s.route) {
      const route = must(cat.routes.get(s.route), `route ${s.route}`);
      await db.insert(schema.packageTransportOptions).values({ packageId: pkgId, transportRouteId: route.id, label: "Standard transfer", isDefault: true });
    }
    if (s.room) {
      const room = must(cat.accommodations.get(s.room.accom)?.rooms.get(s.room.room), `room ${s.room.accom}/${s.room.room}`);
      await db.insert(schema.packageAccommodationOptions).values({ packageId: pkgId, roomTypeId: room.id, label: `${s.room.room} (standard)`, isDefault: true });
    }

    await db.insert(schema.packageCapacity).values({ packageId: pkgId, defaultCapacity: s.capacity });

    if (status === "published") {
      // 150 days of departures. Some partially booked by "other" customers, some sold out, a few closed - so
      // the calendar UI has every state to render. Real seeded bookings are layered on top later.
      const rows: Array<typeof schema.packageAvailability.$inferInsert> = [];
      for (let i = 1; i <= 150; i++) {
        const date = daysFromNow(i);
        const dow = date.getUTCDay();
        const roll = rng();
        let booked = Math.floor(rng() * s.capacity * 0.35);
        let st: string = "open";
        if ((dow === 5 || dow === 6) && roll < 0.14) { booked = s.capacity; st = "sold_out"; }
        else if (roll > 0.97) { st = "closed"; booked = 0; }
        rows.push({ packageId: pkgId, travelDate: isoDay(date), totalCapacity: s.capacity, bookedCount: booked, status: st });
      }
      await db.insert(schema.packageAvailability).values(rows);
    }

    const prefPrices = { adult: s.adult, child: s.child ?? s.adult, infant: s.infant ?? 0 };
    cat.packages.set(s.slug, {
      id: pkgId, tenantId: cat.tenantId, operatorId: op.id, operatorKey: s.operator, slug: s.slug, name: s.name, currency: s.currency, days: s.days,
      ...prefPrices, capacity: s.capacity, status, type: s.type, policies, policyId, destinationId: destIds[0] ?? null,
    });
  }
}

/** Fills in what the original seed left out of its two demo packages (policy, options, activities, capacity). */
async function enrichExistingPackage(
  db: Db, cat: TenantCatalog, slug: string, opKey: string,
  extra: { route?: string; room?: { accom: string; room: string }; activities?: Array<[string, string, number]>; itinerary?: Array<[string, string]>; availabilityDays?: number; policy: PolicyKind; capacity: number; adult: number; child: number; infant?: number; destSlug: string }
) {
  const [pkg] = await db.select().from(schema.packages).where(eq(schema.packages.slug, slug));
  const row = must(pkg, `existing package ${slug}`);
  const policies = cat.policies.get(opKey);
  const policyId = policies ? policies[extra.policy] : null;
  await db.update(schema.packages).set({
    cancellationPolicyId: policyId, inclusions: "Park entry fees\nAll meals\n4x4 safari vehicle with driver-guide", exclusions: "International flights\nTravel insurance\nTips",
    termsAndConditions: "Demo terms: bookings are subject to the operator's cancellation policy. Replace with real terms.", updatedAt: new Date(),
  }).where(eq(schema.packages.id, row.id));
  if (extra.itinerary) {
    // Original seed gave itinerary titles only - add the descriptions.
    for (const [i, [, description]] of extra.itinerary.entries()) {
      await db.update(schema.packageItineraries).set({ description }).where(sql`${schema.packageItineraries.packageId} = ${row.id} and ${schema.packageItineraries.dayNumber} = ${i + 1}`);
    }
  }
  if (extra.route) {
    const route = must(cat.routes.get(extra.route), `route ${extra.route}`);
    await db.insert(schema.packageTransportOptions).values({ packageId: row.id, transportRouteId: route.id, label: "Standard transfer", isDefault: true });
  }
  if (extra.room) {
    const room = must(cat.accommodations.get(extra.room.accom)?.rooms.get(extra.room.room), "room");
    await db.insert(schema.packageAccommodationOptions).values({ packageId: row.id, roomTypeId: room.id, label: `${extra.room.room} (standard)`, isDefault: true });
  }
  if (extra.activities?.length) {
    await db.insert(schema.packageActivities).values(extra.activities.map(([name, description, price]) => ({ packageId: row.id, name, description, isOptional: true, additionalPrice: money(price), currency: "USD" })));
  }
  await db.insert(schema.packageCapacity).values({ packageId: row.id, defaultCapacity: extra.capacity });
  cat.packages.set(slug, {
    id: row.id, tenantId: cat.tenantId, operatorId: row.operatorId, operatorKey: opKey, slug, name: row.name, currency: row.baseCurrency, days: row.durationDays,
    adult: extra.adult, child: extra.child, infant: extra.infant ?? 0, capacity: extra.capacity, status: row.status, type: row.type,
    policies, policyId, destinationId: cat.destinations.get(extra.destSlug)?.id ?? null,
  });
}

async function addDestinationDetails(db: Db, destId: string, spec: Pick<DestSpec, "amenities" | "activities">, extra: Partial<typeof schema.destinations.$inferInsert> = {}) {
  await db.insert(schema.destinationAmenities).values(spec.amenities.map((name) => ({ destinationId: destId, name })));
  await db.insert(schema.destinationActivities).values(spec.activities.map(([name, description]) => ({ destinationId: destId, name, description })));
  if (Object.keys(extra).length) await db.update(schema.destinations).set(extra).where(eq(schema.destinations.id, destId));
}

export async function seedCatalog(db: Db): Promise<CatalogRefs> {
  console.log("  - geography extras");
  const geo = await seedGeographyExtras(db);

  const tenants = await db.select().from(schema.tenants);
  const defaultTenant = must(tenants.find((t) => t.slug === "default"), "default tenant");
  const enrouteTenant = must(tenants.find((t) => t.slug === "enroute-travel-demo"), "enroute tenant");
  const [superAdmin] = await db.select().from(schema.users).where(eq(schema.users.email, "admin@navimus.co.ke"));

  const def = emptyCatalog(defaultTenant.id);
  const enr = emptyCatalog(enrouteTenant.id);

  // ---- existing rows from the base seed, registered so the demo data can build on them
  const existingOps = await db.select().from(schema.operators);
  for (const op of existingOps) {
    const key = op.slug === "rift-valley-safaris-demo" ? "rvs" : op.slug === "enroute-coastal-escapes-demo" ? "escapes" : null;
    if (!key) continue;
    const cat = op.tenantId === defaultTenant.id ? def : enr;
    cat.operators.set(key, { id: op.id, tenantId: op.tenantId, key, name: op.businessName, status: op.status, commission: Number(op.commissionRatePercent ?? 10) });
  }
  const existingDests = await db.select().from(schema.destinations);
  for (const d of existingDests) {
    const cat = d.tenantId === defaultTenant.id ? def : enr;
    cat.destinations.set(d.slug, { id: d.id, name: d.name, cityId: d.cityId });
  }

  const categoryRows = await db.select().from(schema.destinationCategories);
  const defCategories = new Map(categoryRows.filter((c) => c.tenantId === defaultTenant.id).map((c) => [c.slug, c.id]));
  const enrCategoryRows = categoryRows.filter((c) => c.tenantId === enrouteTenant.id);
  const newEnrCats = await db
    .insert(schema.destinationCategories)
    .values(ENROUTE_CATEGORIES.map(([name, slug]) => ({ tenantId: enrouteTenant.id, name, slug })))
    .returning();
  const enrCategories = new Map([...enrCategoryRows, ...newEnrCats].map((c) => [c.slug, c.id]));

  const vtRows = await db.select().from(schema.vehicleTypes);
  const defVehicleTypes = new Map(vtRows.filter((v) => v.tenantId === defaultTenant.id).map((v) => [v.code, v.id]));
  const enrVt = await db
    .insert(schema.vehicleTypes)
    .values([
      { tenantId: enrouteTenant.id, code: "private_car", name: "Private Car", defaultCapacity: 3 },
      { tenantId: enrouteTenant.id, code: "suv", name: "SUV", defaultCapacity: 5 },
      { tenantId: enrouteTenant.id, code: "van", name: "Van", defaultCapacity: 8 },
      { tenantId: enrouteTenant.id, code: "minibus", name: "Minibus", defaultCapacity: 14 },
    ])
    .returning();
  const enrVehicleTypes = new Map(enrVt.map((v) => [v.code, v.id]));

  // ---- default tenant
  console.log("  - default tenant: operators, policies, destinations");
  await createOperators(db, def, DEFAULT_OPERATORS, geo.countryByIso, superAdmin?.id ?? null);
  await createPolicies(db, def, ["rvs", "coastal", "trails", "heritage", "lodges", "movers"]);
  await createDestinations(db, def, DEFAULT_DESTINATIONS, geo.cities, defCategories);

  // The two destinations from the base seed get the same extras as the new ones.
  await addDestinationDetails(db, must(def.destinations.get("maasai-mara-national-reserve"), "mara").id, {
    amenities: ["Park gate", "Airstrips", "Hot-air balloon launch site"],
    activities: [["Big Five game drive", "Morning and afternoon drives."], ["Mara River crossing watch", "Seasonal wildebeest crossings (July-October)."], ["Hot-air balloon safari", "Sunrise flight."]],
  }, { averageDurationHours: 8, timezone: "Africa/Nairobi" });
  await addDestinationDetails(db, must(def.destinations.get("diani-beach"), "diani").id, {
    amenities: ["Beach access", "Water-sports hire", "Restaurants"],
    activities: [["Kite-surfing", "Steady winds Dec-Mar and Jun-Sep."], ["Dhow trip to Wasini", "Snorkelling and seafood."], ["Colobus Trust visit", "Rescue centre for colobus monkeys."]],
  }, { averageDurationHours: 8, timezone: "Africa/Nairobi" });

  console.log("  - default tenant: accommodation, transport, transfers, packages");
  await createAccommodations(db, def, DEFAULT_ACCOMMODATIONS, geo.cities);
  await createTransport(db, def, DEFAULT_PROVIDERS, DEFAULT_VEHICLES, DEFAULT_ROUTES, geo.cities, defVehicleTypes);
  await createTransfers(db, def, DEFAULT_LOCATIONS, DEFAULT_TRANSFERS, geo.cities);
  await createPackages(db, def, DEFAULT_PACKAGES);
  await enrichExistingPackage(db, def, "3-day-maasai-mara-safari-demo", "rvs", {
    route: "nbo-mara", room: { accom: "mara-camp", room: "Standard Tent" }, policy: "flexible", capacity: 12, adult: 650, child: 400, destSlug: "maasai-mara-national-reserve",
    itinerary: [
      ["Arrival", "Drive from Nairobi, check in and head out on an afternoon game drive."],
      ["Full day", "Full-day game drive with a picnic lunch on the plains."],
      ["Departure", "One last morning drive, then breakfast and the road back to Nairobi."],
    ],
    // No seasonal prices on this package: the e2e quote test relies on a flat 650.00 adult price.
    activities: [["Hot-air balloon safari", "Sunrise flight over the Mara.", 480], ["Maasai village visit", "Cultural visit with a local community.", 30]],
  });

  // ---- Enroute tenant
  console.log("  - Enroute tenant: operators, destinations, stays, transport, packages");
  await createOperators(db, enr, ENROUTE_OPERATORS, geo.countryByIso, null);
  await createPolicies(db, enr, ["escapes", "city"]);
  await createDestinations(db, enr, ENROUTE_DESTINATIONS, geo.cities, enrCategories);
  await addDestinationDetails(db, must(enr.destinations.get("diani-beach"), "enroute diani").id, {
    amenities: ["Beach access", "Water-sports hire"], activities: [["Dhow trip to Wasini", "Snorkelling and seafood."], ["Kite-surfing", "Lessons on request."]],
  }, { featured: true, averageDurationHours: 8 });
  await createAccommodations(db, enr, ENROUTE_ACCOMMODATIONS, geo.cities);
  await createTransport(db, enr, ENROUTE_PROVIDERS, ENROUTE_VEHICLES, ENROUTE_ROUTES, geo.cities, enrVehicleTypes);
  await createTransfers(db, enr, ENROUTE_LOCATIONS, ENROUTE_TRANSFERS, geo.cities);
  await createPackages(db, enr, ENROUTE_PACKAGES);
  await enrichExistingPackage(db, enr, "diani-beach-weekend-getaway-demo", "escapes", {
    route: "e-mba-diani", room: { accom: "enroute-diani", room: "Garden Cottage" }, policy: "flexible", capacity: 8, adult: 420, child: 420, destSlug: "diani-beach",
    activities: [["Kite-surfing lesson", "Two-hour beginner lesson.", 85]],
  });
  // That package had no itinerary or availability at all in the base seed.
  const enrDianiPkg = must(enr.packages.get("diani-beach-weekend-getaway-demo"), "enroute diani package");
  await db.insert(schema.packageItineraries).values([
    { packageId: enrDianiPkg.id, dayNumber: 1, title: "Arrive and unwind", description: "Check in and a beach sunset." },
    { packageId: enrDianiPkg.id, dayNumber: 2, title: "Beach and dhow day", description: "Morning on the sand, afternoon dhow sail." },
    { packageId: enrDianiPkg.id, dayNumber: 3, title: "Slow morning and departure", description: "Breakfast, last swim and transfer." },
  ]);
  await db.insert(schema.packagePrices).values([
    { packageId: enrDianiPkg.id, travelerType: "child", pricingType: "individual", amount: "250.00", currency: "USD" },
    { packageId: enrDianiPkg.id, travelerType: "infant", pricingType: "individual", amount: "0.00", currency: "USD" },
  ]);
  enrDianiPkg.child = 250;
  enrDianiPkg.infant = 0;
  await db.insert(schema.packageAvailability).values(
    Array.from({ length: 120 }, (_, i) => ({ packageId: enrDianiPkg.id, travelDate: isoDay(daysFromNow(i + 1)), totalCapacity: 8, bookedCount: 0, status: "open" }))
  );

  return {
    cities: geo.cities,
    countries: geo.countryByIso,
    tenants: { default: defaultTenant.id, enroute: enrouteTenant.id },
    default: def,
    enroute: enr,
  };
}
