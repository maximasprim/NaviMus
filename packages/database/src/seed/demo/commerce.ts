import { schema, sql } from "../../client.js";
import { DEFAULT_PACKAGES, ENROUTE_PACKAGES, type PkgSpec } from "./catalog-data.js";
import type { CatalogRefs, PackageRef, TenantCatalog } from "./catalog.js";
import type { CustomerRef, PeopleRefs } from "./people.js";
import { USD_PER_UNIT, daysAgo, daysFromNow, isoDay, money, must, round2, type Db } from "./helpers.js";

export type BookingStatus =
  | "DRAFT" | "PENDING_PAYMENT" | "PAYMENT_PROCESSING" | "CONFIRMED" | "PARTIALLY_PAID" | "FULLY_PAID" | "UPCOMING" | "IN_PROGRESS"
  | "COMPLETED" | "CANCEL_REQUESTED" | "CANCELLED" | "REFUND_PENDING" | "REFUNDED" | "EXPIRED" | "FAILED";

/** The path of status transitions that leads to each state (mirrors BOOKING_STATUS_TRANSITIONS). */
const PATHS: Record<BookingStatus, BookingStatus[]> = {
  DRAFT: ["DRAFT"],
  PENDING_PAYMENT: ["DRAFT", "PENDING_PAYMENT"],
  PAYMENT_PROCESSING: ["DRAFT", "PENDING_PAYMENT", "PAYMENT_PROCESSING"],
  CONFIRMED: ["DRAFT", "PENDING_PAYMENT", "PAYMENT_PROCESSING", "CONFIRMED"],
  PARTIALLY_PAID: ["DRAFT", "PENDING_PAYMENT", "PAYMENT_PROCESSING", "PARTIALLY_PAID"],
  FULLY_PAID: ["DRAFT", "PENDING_PAYMENT", "PAYMENT_PROCESSING", "PARTIALLY_PAID", "FULLY_PAID"],
  UPCOMING: ["DRAFT", "PENDING_PAYMENT", "PAYMENT_PROCESSING", "CONFIRMED", "UPCOMING"],
  IN_PROGRESS: ["DRAFT", "PENDING_PAYMENT", "PAYMENT_PROCESSING", "CONFIRMED", "UPCOMING", "IN_PROGRESS"],
  COMPLETED: ["DRAFT", "PENDING_PAYMENT", "PAYMENT_PROCESSING", "CONFIRMED", "UPCOMING", "IN_PROGRESS", "COMPLETED"],
  CANCEL_REQUESTED: ["DRAFT", "PENDING_PAYMENT", "PAYMENT_PROCESSING", "CONFIRMED", "CANCEL_REQUESTED"],
  CANCELLED: ["DRAFT", "PENDING_PAYMENT", "PAYMENT_PROCESSING", "CONFIRMED", "CANCEL_REQUESTED", "CANCELLED"],
  REFUND_PENDING: ["DRAFT", "PENDING_PAYMENT", "PAYMENT_PROCESSING", "CONFIRMED", "CANCEL_REQUESTED", "CANCELLED", "REFUND_PENDING"],
  REFUNDED: ["DRAFT", "PENDING_PAYMENT", "PAYMENT_PROCESSING", "CONFIRMED", "CANCEL_REQUESTED", "CANCELLED", "REFUND_PENDING", "REFUNDED"],
  EXPIRED: ["DRAFT", "PENDING_PAYMENT", "EXPIRED"],
  FAILED: ["DRAFT", "PENDING_PAYMENT", "PAYMENT_PROCESSING", "FAILED"],
};

/** Statuses that currently hold seats on the departure. */
const HOLDS_SEATS = new Set<BookingStatus>([
  "PENDING_PAYMENT", "PAYMENT_PROCESSING", "CONFIRMED", "PARTIALLY_PAID", "FULLY_PAID", "UPCOMING", "IN_PROGRESS", "COMPLETED", "CANCEL_REQUESTED",
]);
const NO_PAYMENT = new Set<BookingStatus>(["DRAFT", "PENDING_PAYMENT", "EXPIRED"]);

interface Plan {
  key: string; tenant: "default" | "enroute"; customer: number; pkg: string; status: BookingStatus;
  travel: number; created: number; adults: number; children?: number; coupon?: string; note?: string;
  acc?: boolean; transport?: boolean; transfer?: [string, string]; cancelDaysBefore?: number; fullyRefunded?: boolean;
  review?: { rating: number; title: string; body: string; status?: string; reports?: number; response?: string; accommodation?: { rating: number; title: string; body: string } };
}

const DEFAULT_PLANS: Plan[] = [
  { key: "d01", tenant: "default", customer: 1, pkg: "3-day-maasai-mara-safari-demo", status: "COMPLETED", travel: -160, created: 190, adults: 2,
    review: { rating: 5, title: "An unforgettable first safari", body: "Lions on day one and the guide knew every animal by name. Camp food was excellent.", response: "Thank you Amina - we loved hosting you and hope to see you for the migration next year!" } },
  { key: "d02", tenant: "default", customer: 2, pkg: "diani-beach-escape", status: "COMPLETED", travel: -140, created: 170, adults: 2, children: 1, acc: true, transfer: ["mia", "diani-hotel"],
    review: { rating: 4, title: "Relaxing family week", body: "Beautiful beach and a great kids' club. The dhow trip was the highlight.", accommodation: { rating: 5, title: "Lovely resort", body: "Spotless rooms and friendly staff." } } },
  { key: "d03", tenant: "default", customer: 3, pkg: "5-day-mara-nakuru-safari", status: "COMPLETED", travel: -118, created: 150, adults: 2, coupon: "WELCOME10", transport: true, acc: true,
    review: { rating: 5, title: "Rhinos and big cats", body: "Lake Nakuru's rhinos were a surprise highlight, and the Mara delivered. Superb driver-guide.", response: "Asante sana Catherine!", accommodation: { rating: 4, title: "Comfortable tented camp", body: "Great tents; the generator went off briefly one night." } } },
  { key: "d04", tenant: "default", customer: 8, pkg: "7-day-kenya-classic-circuit", status: "COMPLETED", travel: -95, created: 130, adults: 2, children: 0,
    review: { rating: 4, title: "A lot packed in", body: "Fantastic variety of parks. A couple of long drives, but worth it.", response: "Thanks Hannah - the long drives are the price of seeing three parks in a week." } },
  { key: "d05", tenant: "default", customer: 4, pkg: "mombasa-heritage-day-trip-kes", status: "COMPLETED", travel: -75, created: 85, adults: 3,
    review: { rating: 5, title: "History done right", body: "Our guide brought Fort Jesus to life. The Swahili lunch was delicious." } },
  { key: "d06", tenant: "default", customer: 9, pkg: "honeymoon-diani-watamu", status: "COMPLETED", travel: -60, created: 95, adults: 2, acc: true, transfer: ["mia", "diani-hotel"],
    review: { rating: 5, title: "Perfect honeymoon", body: "Every detail was thought of - the sunset dhow dinner was magical.", response: "Congratulations again, James and Emily!" } },
  { key: "d07", tenant: "default", customer: 5, pkg: "hells-gate-cycling-weekend-kes", status: "COMPLETED", travel: -40, created: 55, adults: 4,
    review: { rating: 3, title: "Fun but muddy", body: "Great cycling, though recent rain made the gorge section slippery and the bikes needed servicing." } },
  { key: "d08", tenant: "default", customer: 6, pkg: "family-safari-nairobi-nakuru", status: "COMPLETED", travel: -25, created: 50, adults: 2, children: 2, transport: true,
    review: { rating: 5, title: "Kids loved it", body: "The giraffe feeding was the favourite. Patient guide and child seats ready.", response: "So glad the kids enjoyed it!" } },
  { key: "d09", tenant: "default", customer: 10, pkg: "4-day-amboseli-kilimanjaro-views", status: "COMPLETED", travel: -12, created: 40, adults: 2, transport: true,
    review: { rating: 4, title: "Elephants everywhere", body: "Kilimanjaro came out on the second morning - stunning.", status: "pending_moderation" } },
  { key: "d10", tenant: "default", customer: 11, pkg: "lamu-swahili-culture-escape", status: "COMPLETED", travel: -6, created: 30, adults: 2,
    review: { rating: 2, title: "Boat transfer was late", body: "Lamu itself was wonderful but our boat transfer ran an hour late and nobody told us.", response: "We're sorry, Priya - we've changed our dispatch process after your feedback." } },
  { key: "d11", tenant: "default", customer: 7, pkg: "mount-kenya-sirimon-trek", status: "IN_PROGRESS", travel: -1, created: 25, adults: 2 },
  { key: "d12", tenant: "default", customer: 0, pkg: "3-day-maasai-mara-safari-demo", status: "UPCOMING", travel: 4, created: 12, adults: 2, children: 1, note: "Window seat for the children, please." },
  { key: "d13", tenant: "default", customer: 2, pkg: "7-day-kenya-classic-circuit", status: "UPCOMING", travel: 6, created: 18, adults: 3 },
  { key: "d14", tenant: "default", customer: 3, pkg: "diani-beach-escape", status: "CONFIRMED", travel: 30, created: 6, adults: 2, children: 1, coupon: "EARLYBIRD15", transfer: ["mia", "diani-hotel"] },
  { key: "d15", tenant: "default", customer: 8, pkg: "5-day-mara-nakuru-safari", status: "CONFIRMED", travel: 45, created: 5, adults: 2, transport: true, acc: true, note: "Celebrating a 10th anniversary." },
  { key: "d16", tenant: "default", customer: 9, pkg: "honeymoon-diani-watamu", status: "PARTIALLY_PAID", travel: 70, created: 9, adults: 2, acc: true },
  { key: "d17", tenant: "default", customer: 10, pkg: "lamu-swahili-culture-escape", status: "FULLY_PAID", travel: 35, created: 4, adults: 2 },
  { key: "d18", tenant: "default", customer: 4, pkg: "hells-gate-cycling-weekend-kes", status: "PAYMENT_PROCESSING", travel: 20, created: 0, adults: 2 },
  { key: "d19", tenant: "default", customer: 5, pkg: "4-day-amboseli-kilimanjaro-views", status: "PENDING_PAYMENT", travel: 50, created: 0, adults: 2, coupon: "SAFARI50" },
  { key: "d20", tenant: "default", customer: 6, pkg: "nairobi-food-and-nightlife-kes", status: "PENDING_PAYMENT", travel: 15, created: 0, adults: 2 },
  { key: "d21", tenant: "default", customer: 7, pkg: "mount-kenya-sirimon-trek", status: "DRAFT", travel: 80, created: 0, adults: 2 },
  { key: "d22", tenant: "default", customer: 11, pkg: "family-safari-nairobi-nakuru", status: "EXPIRED", travel: 25, created: 3, adults: 2, children: 2 },
  { key: "d23", tenant: "default", customer: 1, pkg: "diani-beach-escape", status: "FAILED", travel: 40, created: 2, adults: 2 },
  { key: "d24", tenant: "default", customer: 2, pkg: "lamu-swahili-culture-escape", status: "CANCEL_REQUESTED", travel: 28, created: 8, adults: 2 },
  { key: "d25", tenant: "default", customer: 3, pkg: "4-day-amboseli-kilimanjaro-views", status: "CANCELLED", travel: 5, created: 20, adults: 2, cancelDaysBefore: 5 },
  { key: "d26", tenant: "default", customer: 8, pkg: "family-safari-nairobi-nakuru", status: "REFUND_PENDING", travel: 20, created: 25, adults: 2, children: 2, cancelDaysBefore: 20 },
  { key: "d27", tenant: "default", customer: 9, pkg: "diani-beach-escape", status: "REFUNDED", travel: 40, created: 45, adults: 2, cancelDaysBefore: 35, fullyRefunded: true },
  { key: "d28", tenant: "default", customer: 13, pkg: "mombasa-heritage-day-trip-kes", status: "COMPLETED", travel: -90, created: 100, adults: 2,
    review: { rating: 1, title: "Not as described", body: "Spam-looking review removed by moderators in this demo dataset.", status: "removed", reports: 4 } },
  { key: "d29", tenant: "default", customer: 14, pkg: "hells-gate-cycling-weekend-kes", status: "COMPLETED", travel: -120, created: 130, adults: 2,
    review: { rating: 4, title: "Great day out", body: "Well organised, good bikes, friendly guide." } },
  { key: "d30", tenant: "default", customer: 4, pkg: "corporate-retreat-naivasha", status: "CONFIRMED", travel: 60, created: 14, adults: 12, note: "Need a projector and a flipchart." },
  { key: "d31", tenant: "default", customer: 5, pkg: "school-trip-nairobi-kes", status: "CONFIRMED", travel: 45, created: 10, adults: 2, children: 22 },
  { key: "d32", tenant: "default", customer: 6, pkg: "7-day-kenya-classic-circuit", status: "COMPLETED", travel: -30, created: 70, adults: 2,
    review: { rating: 5, title: "Worth every shilling", body: "Seven days, three parks, zero stress.", response: "Asante Faith!" } },
];

const ENROUTE_PLANS: Plan[] = [
  { key: "e01", tenant: "enroute", customer: 0, pkg: "watamu-snorkel-turtle-day", status: "COMPLETED", travel: -50, created: 70, adults: 2,
    review: { rating: 5, title: "Turtles!", body: "We swam with a turtle on the reef - the guides were wonderful.", response: "Thank you Kamau, come back soon!" } },
  { key: "e02", tenant: "enroute", customer: 1, pkg: "mombasa-old-town-walking-tour-kes", status: "COMPLETED", travel: -30, created: 40, adults: 3,
    review: { rating: 4, title: "Great guide", body: "Learned so much about the old town. A bit hot in the afternoon." } },
  { key: "e03", tenant: "enroute", customer: 2, pkg: "diani-beach-weekend-getaway-demo", status: "COMPLETED", travel: -20, created: 35, adults: 2, children: 1, acc: true,
    review: { rating: 5, title: "Perfect weekend", body: "Quiet beach, friendly cottage staff and an easy transfer from Mombasa." } },
  { key: "e04", tenant: "enroute", customer: 3, pkg: "lamu-dhow-sunset-experience", status: "CONFIRMED", travel: 25, created: 5, adults: 2 },
  { key: "e05", tenant: "enroute", customer: 0, pkg: "diani-honeymoon-five-nights", status: "PENDING_PAYMENT", travel: 60, created: 0, adults: 2 },
  { key: "e06", tenant: "enroute", customer: 1, pkg: "watamu-snorkel-turtle-day", status: "REFUNDED", travel: 30, created: 40, adults: 2, cancelDaysBefore: 30, fullyRefunded: true },
  { key: "e07", tenant: "enroute", customer: 2, pkg: "diani-beach-weekend-getaway-demo", status: "UPCOMING", travel: 5, created: 12, adults: 2 },
];

export interface BookingRef {
  id: string; key: string; tenantId: string; tenant: "default" | "enroute"; status: BookingStatus; userId: string; userEmail: string;
  userPhone: string; packageId: string; packageName: string; operatorId: string; currency: string; total: number; createdAt: Date; travelDate: string;
  paymentId?: string;
}
export interface CommerceRefs { bookings: BookingRef[]; coupons: Map<string, string>; reviewIds: string[] }

const specBySlug = new Map<string, PkgSpec>([...DEFAULT_PACKAGES, ...ENROUTE_PACKAGES].map((s) => [s.slug, s]));

function seasonalAdult(spec: PkgSpec | undefined, date: string, base: number, child: number): { adult: number; child: number } {
  if (!spec?.season) return { adult: base, child };
  const mmdd = date.slice(5);
  const { start, end } = spec.season;
  const inSeason = start <= end ? mmdd >= start && mmdd <= end : mmdd >= start || mmdd <= end;
  return inSeason ? { adult: spec.season.adult, child: spec.season.child ?? child } : { adult: base, child };
}

async function seedPromotions(db: Db, refs: CatalogRefs) {
  const def = refs.default;
  const enr = refs.enroute;
  const op = (cat: TenantCatalog, key: string) => must(cat.operators.get(key), `operator ${key}`).id;
  const rows = await db
    .insert(schema.coupons)
    .values([
      { tenantId: def.tenantId, code: "WELCOME10", discountType: "percentage", discountValue: "10.00", validFrom: isoDay(daysAgo(120)), validUntil: isoDay(daysFromNow(240)) },
      { tenantId: def.tenantId, code: "EARLYBIRD15", discountType: "percentage", discountValue: "15.00", minBookingAmount: "300.00", validFrom: isoDay(daysAgo(60)), validUntil: isoDay(daysFromNow(120)), maxUses: 200 },
      { tenantId: def.tenantId, code: "SAFARI50", operatorId: op(def, "rvs"), discountType: "fixed_amount", discountValue: "50.00", currency: "USD", minBookingAmount: "500.00", validFrom: isoDay(daysAgo(30)), validUntil: isoDay(daysFromNow(60)), maxUses: 100 },
      { tenantId: def.tenantId, code: "COASTAL12", operatorId: op(def, "coastal"), discountType: "percentage", discountValue: "12.00", validFrom: isoDay(daysAgo(10)), validUntil: isoDay(daysFromNow(90)) },
      { tenantId: def.tenantId, code: "KES1000", discountType: "fixed_amount", discountValue: "1000.00", currency: "KES", minBookingAmount: "5000.00", validFrom: isoDay(daysAgo(30)), validUntil: isoDay(daysFromNow(60)) },
      { tenantId: def.tenantId, code: "EXPIRED20", discountType: "percentage", discountValue: "20.00", validFrom: isoDay(daysAgo(120)), validUntil: isoDay(daysAgo(10)) },
      { tenantId: def.tenantId, code: "SOLDOUT25", discountType: "percentage", discountValue: "25.00", maxUses: 5, usedCount: 5, validFrom: isoDay(daysAgo(60)), validUntil: isoDay(daysFromNow(60)) },
      { tenantId: def.tenantId, code: "DISABLED30", discountType: "percentage", discountValue: "30.00", isActive: false },
      { tenantId: enr.tenantId, code: "ENROUTE10", discountType: "percentage", discountValue: "10.00", validFrom: isoDay(daysAgo(30)), validUntil: isoDay(daysFromNow(180)) },
      { tenantId: enr.tenantId, code: "COAST500", discountType: "fixed_amount", discountValue: "500.00", currency: "KES", minBookingAmount: "3000.00", validFrom: isoDay(daysAgo(30)), validUntil: isoDay(daysFromNow(90)) },
      { tenantId: enr.tenantId, code: "ENROUTEOLD", discountType: "percentage", discountValue: "15.00", validUntil: isoDay(daysAgo(30)) },
    ])
    .returning();
  const promos = await db
    .insert(schema.promotions)
    .values([
      { tenantId: def.tenantId, name: "Early-bird safari saver", type: "early_booking", description: "Book 60+ days ahead and save 10% on safari packages.", startsAt: daysAgo(30), endsAt: daysFromNow(150) },
      { tenantId: def.tenantId, name: "Big group discount", type: "group", description: "8% off for groups of 6 or more.", startsAt: daysAgo(30), endsAt: daysFromNow(300) },
      { tenantId: def.tenantId, name: "Long-weekend flash sale", type: "flash_sale", description: "48-hour coastal flash sale.", startsAt: daysAgo(60), endsAt: daysAgo(55), isActive: false },
      { tenantId: def.tenantId, name: "Green-season special", type: "seasonal", description: "Low-season rates on selected parks.", startsAt: daysFromNow(30), endsAt: daysFromNow(120) },
      { tenantId: enr.tenantId, name: "Enroute last-minute coast deals", type: "last_minute", description: "10% off departures within 7 days.", startsAt: daysAgo(10), endsAt: daysFromNow(60) },
    ])
    .returning();
  await db.insert(schema.discounts).values([
    { promotionId: promos[0]!.id, conditionKey: "days_before_travel_min", conditionValue: "60", discountType: "percentage", discountValue: "10.00" },
    { promotionId: promos[1]!.id, conditionKey: "min_travelers", conditionValue: "6", discountType: "percentage", discountValue: "8.00" },
    { promotionId: promos[2]!.id, conditionKey: "package_type", conditionValue: "beach_holiday", discountType: "percentage", discountValue: "20.00" },
    { promotionId: promos[3]!.id, conditionKey: "travel_month", conditionValue: "04,05,11", discountType: "percentage", discountValue: "12.00" },
    { promotionId: promos[4]!.id, conditionKey: "days_before_travel_max", conditionValue: "7", discountType: "percentage", discountValue: "10.00" },
  ]);
  return new Map(rows.map((c) => [`${c.tenantId}:${c.code}`, c.id]));
}

export async function seedCommerce(db: Db, refs: CatalogRefs, people: PeopleRefs): Promise<CommerceRefs> {
  console.log("  - coupons and promotions");
  const coupons = await seedPromotions(db, refs);

  const rules = await db.select().from(schema.cancellationRules);
  const couponDefs = new Map((await db.select().from(schema.coupons)).map((c) => [`${c.tenantId}:${c.code}`, c]));
  const roomIndex = new Map<string, { price: number }>();
  for (const cat of [refs.default, refs.enroute]) for (const a of cat.accommodations.values()) for (const r of a.rooms.values()) roomIndex.set(r.id, { price: r.price });

  const staffId = (alias: string) => must(people.staff.get(alias), `staff ${alias}`).id;
  const bookingsOut: BookingRef[] = [];
  const reviewIds: string[] = [];
  const couponUse = new Map<string, number>();
  const seatDelta = new Map<string, { pkg: PackageRef; date: string; n: number }>();
  let seq = 0;

  console.log("  - bookings, payments, ledger, invoices, refunds, reviews");
  for (const plan of [...DEFAULT_PLANS, ...ENROUTE_PLANS]) {
    seq++;
    const cat = plan.tenant === "default" ? refs.default : refs.enroute;
    const customers: CustomerRef[] = plan.tenant === "default" ? people.customers.default : people.customers.enroute;
    const customer = must(customers[plan.customer], `customer ${plan.customer} (${plan.key})`);
    const pkg = must(cat.packages.get(plan.pkg), `package ${plan.pkg}`);
    const spec = specBySlug.get(plan.pkg);
    const op = must([...cat.operators.values()].find((o) => o.id === pkg.operatorId), "operator");
    const children = plan.children ?? 0;
    const travelerCount = plan.adults + children;
    const travelDate = isoDay(daysFromNow(plan.travel));
    const createdAt = new Date(Date.now() - Math.max(plan.created, 0.02) * 86_400_000);

    // ---- pricing (mirrors the quote engine: per-traveler-type price + add-ons - coupon)
    const px = seasonalAdult(spec, travelDate, pkg.adult, pkg.child);
    const packageSubtotal = plan.adults * px.adult + children * px.child;
    const addOns: Array<{ type: "transport" | "accommodation" | "transfer"; refId: string; description: string; amount: number; qty: number; extra: Record<string, unknown> }> = [];
    if (plan.transport && spec?.route && pkg.currency === "USD") {
      const route = must(cat.routes.get(spec.route), "route");
      addOns.push({ type: "transport", refId: route.id, description: "Transport", amount: route.price, qty: 1, extra: { route } });
    }
    if (plan.acc && spec?.room && pkg.currency === "USD") {
      const room = must(cat.accommodations.get(spec.room.accom)?.rooms.get(spec.room.room), "room");
      const rooms = Math.max(1, Math.ceil(travelerCount / 2));
      const checkOut = isoDay(new Date(new Date(travelDate).getTime() + pkg.days * 86_400_000));
      addOns.push({ type: "accommodation", refId: room.id, description: `Accommodation (${travelDate} to ${checkOut})`, amount: room.price * pkg.days * rooms, qty: rooms, extra: { room, rooms, checkOut } });
    }
    if (plan.transfer && pkg.currency === "USD") {
      const t = cat.transfers.find((x) => x.pickup === plan.transfer![0] && x.dropoff === plan.transfer![1]);
      if (t) addOns.push({ type: "transfer", refId: t.id, description: "Airport transfer", amount: t.price, qty: 1, extra: {} });
    }
    const addOnTotal = addOns.reduce((s, a) => s + a.amount, 0);
    const preDiscount = packageSubtotal + addOnTotal;
    let discount = 0;
    if (plan.coupon) {
      const def = must(couponDefs.get(`${cat.tenantId}:${plan.coupon}`), `coupon ${plan.coupon}`);
      discount = def.discountType === "percentage" ? round2(preDiscount * Number(def.discountValue) / 100) : Math.min(Number(def.discountValue), preDiscount);
      couponUse.set(def.id, (couponUse.get(def.id) ?? 0) + 1);
    }
    const total = round2(preDiscount - discount);

    // ---- payment facts implied by the status
    const status = plan.status;
    const paidFull = ["CONFIRMED", "FULLY_PAID", "UPCOMING", "IN_PROGRESS", "COMPLETED", "CANCEL_REQUESTED", "CANCELLED", "REFUND_PENDING", "REFUNDED"].includes(status);
    const amountPaid = paidFull ? total : status === "PARTIALLY_PAID" ? round2(total / 2) : 0;
    const confirmedAt = ["CONFIRMED", "PARTIALLY_PAID", "FULLY_PAID", "UPCOMING", "IN_PROGRESS", "COMPLETED", "CANCEL_REQUESTED", "CANCELLED", "REFUND_PENDING", "REFUNDED"].includes(status)
      ? new Date(createdAt.getTime() + 3_600_000) : null;
    const holdExpiresAt =
      status === "EXPIRED" ? new Date(createdAt.getTime() + 15 * 60_000)
      : ["DRAFT", "PENDING_PAYMENT", "PAYMENT_PROCESSING"].includes(status) ? daysFromNow(1) : null;

    const [booking] = await db
      .insert(schema.bookings)
      .values({
        tenantId: cat.tenantId, userId: customer.id, packageId: pkg.id, status, travelDate, travelerCount, subtotalAmount: money(preDiscount),
        discountAmount: money(discount), taxAmount: "0.00", totalAmount: money(total), amountPaid: money(amountPaid), currency: pkg.currency,
        couponCode: plan.coupon ?? null, contactEmail: customer.email, contactPhone: customer.phone, specialRequests: plan.note ?? null,
        cancellationPolicyId: pkg.policyId, idempotencyKey: `seed-booking-${plan.key}`, holdExpiresAt, confirmedAt, createdAt, updatedAt: createdAt,
      })
      .returning();
    const bookingId = booking!.id;

    // ---- travelers (cycle through the customer's saved travelers; children map to the child traveler)
    const adultsSaved = customer.travelers.filter((t) => t.type === "adult");
    const childSaved = customer.travelers.filter((t) => t.type === "child");
    const bt: Array<typeof schema.bookingTravelers.$inferInsert> = [];
    for (let i = 0; i < plan.adults; i++) bt.push({ bookingId, travelerId: must(adultsSaved[i % adultsSaved.length], "adult traveler").id, travelerType: "adult", priceAmount: money(px.adult), currency: pkg.currency });
    for (let i = 0; i < children; i++) {
      const t = childSaved.length ? childSaved[i % childSaved.length]! : adultsSaved[0]!;
      bt.push({ bookingId, travelerId: t.id, travelerType: "child", priceAmount: money(px.child), currency: pkg.currency });
    }
    await db.insert(schema.bookingTravelers).values(bt);

    // ---- add-ons: the per-service booking row plus the booking item that points at it
    const subStatus = ["CONFIRMED", "PARTIALLY_PAID", "FULLY_PAID", "UPCOMING", "IN_PROGRESS", "COMPLETED", "CANCEL_REQUESTED"].includes(status) ? "confirmed"
      : ["DRAFT", "PENDING_PAYMENT", "PAYMENT_PROCESSING"].includes(status) ? "held" : "cancelled";
    for (const a of addOns) {
      if (a.type === "transport") {
        const route = a.extra.route as { id: string; provider: string };
        const vehicleId = cat.vehicles.get(route.provider)?.[0];
        await db.insert(schema.transportBookings).values({ bookingId, transportRouteId: route.id, vehicleId, travelDate, passengerCount: travelerCount, price: money(a.amount), currency: "USD", status: subStatus });
      } else if (a.type === "accommodation") {
        const ex = a.extra as { room: { id: string; price: number }; rooms: number; checkOut: string };
        await db.insert(schema.accommodationBookings).values({ roomTypeId: ex.room.id, bookingId, checkInDate: travelDate, checkOutDate: ex.checkOut, roomsBooked: ex.rooms, pricePerNight: money(ex.room.price), currency: "USD", status: subStatus });
      } else {
        await db.insert(schema.transferBookings).values({
          bookingId, airportTransferId: a.refId, transferDate: travelDate, transferTime: "09:30", passengerCount: travelerCount, luggageCount: travelerCount, childSeatsRequired: children > 0 ? 1 : 0,
          flightNumber: "KQ 100", driverContact: "+254700000999", vehicleDetails: "White Toyota Hiace, KDX 103C", price: money(a.amount), currency: "USD", status: subStatus,
        });
      }
      await db.insert(schema.bookingItems).values({ bookingId, itemType: a.type, referenceId: a.refId, description: a.description, quantity: 1, amount: money(a.amount), currency: "USD" });
    }

    // ---- status history, spaced out from creation
    const path = PATHS[status];
    const step = Math.max(10 * 60_000, Math.min(36 * 3_600_000, (Date.now() - createdAt.getTime()) / (path.length + 1)));
    await db.insert(schema.bookingStatusHistory).values(
      path.map((to, i) => ({
        bookingId, fromStatus: i === 0 ? null : path[i - 1], toStatus: to, createdAt: new Date(createdAt.getTime() + i * step),
        changedByUserId: to === "CANCELLED" || to === "REFUND_PENDING" || to === "REFUNDED" ? staffId(plan.tenant === "default" ? "support" : "enroute_finance") : customer.id,
        reason: to === "EXPIRED" ? "Payment hold expired" : to === "FAILED" ? "Payment declined" : to === "CANCEL_REQUESTED" ? "Customer requested cancellation" : null,
        metadata: to === "PAYMENT_PROCESSING" ? { provider: pkg.currency === "KES" ? "mpesa" : "stripe" } : null,
      }))
    );

    // ---- seats (aggregated so each availability row is written once)
    if (HOLDS_SEATS.has(status)) {
      const key = `${pkg.id}:${travelDate}`;
      const cur = seatDelta.get(key);
      seatDelta.set(key, { pkg, date: travelDate, n: (cur?.n ?? 0) + travelerCount });
    }

    // ---- payment, transaction, webhook, ledger
    let paymentId: string | undefined;
    if (!NO_PAYMENT.has(status)) {
      const provider = pkg.currency === "KES" ? "mpesa" : "stripe";
      const failed = status === "FAILED";
      const processing = status === "PAYMENT_PROCESSING";
      const payAmount = failed || processing ? total : amountPaid;
      const rate = USD_PER_UNIT[pkg.currency] ?? 1;
      const paidAt = new Date(createdAt.getTime() + 30 * 60_000);
      const payStatus =
        failed ? "FAILED" : processing ? "PENDING" : status === "REFUND_PENDING" ? "REFUND_PENDING"
        : status === "REFUNDED" ? (plan.fullyRefunded === false ? "PARTIALLY_REFUNDED" : "REFUNDED") : "PAID";
      const receipt = provider === "mpesa" ? `SDM${String(seq).padStart(2, "0")}K${(seq * 7919).toString(36).toUpperCase().slice(0, 5)}` : `ch_seed_${plan.key}`;
      const [pay] = await db
        .insert(schema.payments)
        .values({
          tenantId: cat.tenantId, bookingId, provider, status: payStatus, originalAmount: money(payAmount), originalCurrency: pkg.currency,
          exchangeRate: rate.toFixed(8), baseCurrencyAmount: money(payAmount * rate), baseCurrency: "USD", idempotencyKey: `seed-payment-${plan.key}`,
          providerReceipt: failed || processing ? null : receipt, createdAt: paidAt, updatedAt: paidAt,
        })
        .returning();
      paymentId = pay!.id;
      const providerRef = provider === "mpesa" ? `ws_CO_SEED_${plan.key.toUpperCase()}` : `pi_seed_${plan.key}`;
      await db.insert(schema.paymentTransactions).values({
        paymentId: pay!.id, providerReference: providerRef, createdAt: paidAt,
        rawPayload: provider === "mpesa"
          ? { MerchantRequestID: `seed-mr-${plan.key}`, CheckoutRequestID: providerRef, ResponseCode: failed ? "1" : "0", CustomerMessage: failed ? "Request cancelled by user" : "Success. Request accepted for processing" }
          : { id: providerRef, object: "payment_intent", amount: Math.round(payAmount * 100), currency: pkg.currency.toLowerCase(), status: failed ? "requires_payment_method" : processing ? "processing" : "succeeded" },
      });
      if (!processing) {
        await db.insert(schema.paymentWebhooks).values({
          provider, eventId: `evt_seed_${plan.key}`, signatureVerified: true, processedAt: new Date(paidAt.getTime() + 5_000), createdAt: new Date(paidAt.getTime() + 2_000),
          payload: provider === "mpesa"
            ? { Body: { stkCallback: { CheckoutRequestID: providerRef, ResultCode: failed ? 1032 : 0, ResultDesc: failed ? "Request cancelled by user" : "The service request is processed successfully." } } }
            : { id: `evt_seed_${plan.key}`, type: failed ? "payment_intent.payment_failed" : "payment_intent.succeeded", data: { object: { id: providerRef } } },
        });
      }
      if (!failed && !processing) {
        const fee = round2(payAmount * (op.commission / 100));
        await db.insert(schema.ledgerEntries).values([
          { bookingId, paymentId: pay!.id, entryType: "customer_payment", amount: money(payAmount), currency: pkg.currency, description: "Customer payment received", createdAt: paidAt },
          { bookingId, paymentId: pay!.id, entryType: "platform_fee", amount: money(-fee), currency: pkg.currency, description: `Platform commission (${op.commission}%)`, createdAt: paidAt },
          { bookingId, paymentId: pay!.id, entryType: "operator_earning", amount: money(-(payAmount - fee)), currency: pkg.currency, description: "Operator earning", createdAt: paidAt },
        ]);
      }

      // ---- cancellations and refunds
      if (["CANCELLED", "REFUND_PENDING", "REFUNDED"].includes(status)) {
        const days = plan.cancelDaysBefore ?? 30;
        const policyRules = rules.filter((r) => r.policyId === pkg.policyId);
        const rule = policyRules.find((r) => days >= r.daysBeforeMin && (r.daysBeforeMax === null || days <= r.daysBeforeMax));
        const refundPct = rule ? Number(rule.refundPercentage) : 0;
        const refundAmount = round2(amountPaid * refundPct / 100);
        const penaltyAmount = round2(amountPaid - refundAmount);
        const cancelledAt = new Date(createdAt.getTime() + 5 * step);
        await db.insert(schema.bookingCancellations).values({
          bookingId, ruleAppliedId: rule?.id, daysBeforeTrip: days, refundAmount: money(refundAmount), penaltyAmount: money(penaltyAmount), currency: pkg.currency,
          requestedByUserId: customer.id, reason: "Change of plans", createdAt: cancelledAt,
        });
        if (status !== "CANCELLED" && refundAmount > 0) {
          const settled = status === "REFUNDED";
          await db.insert(schema.paymentRefunds).values({
            paymentId: pay!.id, amount: money(refundAmount), currency: pkg.currency, status: settled ? "REFUNDED" : "REFUND_PENDING",
            reason: "Booking cancelled by customer", providerReference: provider === "mpesa" ? `seed-rev-${plan.key}` : `re_seed_${plan.key}`, createdAt: cancelledAt, updatedAt: cancelledAt,
          });
          if (settled) {
            await db.insert(schema.ledgerEntries).values({ bookingId, paymentId: pay!.id, entryType: "refund", amount: money(-refundAmount), currency: pkg.currency, description: "Booking cancelled by customer", createdAt: cancelledAt });
          }
        }
        if (penaltyAmount > 0 && status !== "CANCELLED") {
          await db.insert(schema.ledgerEntries).values({ bookingId, paymentId: pay!.id, entryType: "cancellation_penalty", amount: money(penaltyAmount), currency: pkg.currency, description: `Cancellation penalty (${days} days before travel)`, createdAt: cancelledAt });
        }
      }

      // ---- invoice (created once a payment is applied)
      if (!failed && !processing) {
        await db.insert(schema.invoices).values({
          tenantId: cat.tenantId, bookingId, invoiceNumber: `INV-${createdAt.getUTCFullYear()}-${bookingId.replace(/-/g, "").slice(0, 8).toUpperCase()}`,
          totalAmount: money(total), amountPaid: money(amountPaid), balanceDue: money(Math.max(0, total - amountPaid)), currency: pkg.currency, createdAt: paidAt, updatedAt: paidAt,
        });
      }
    }

    // ---- reviews on completed trips
    if (plan.review && status === "COMPLETED") {
      const reviewedAt = new Date(new Date(travelDate).getTime() + (pkg.days + 2) * 86_400_000);
      const [rev] = await db
        .insert(schema.reviews)
        .values({
          tenantId: cat.tenantId, userId: customer.id, bookingId, subjectType: "package", subjectId: pkg.id, rating: plan.review.rating, title: plan.review.title, body: plan.review.body,
          status: plan.review.status ?? "published", reportCount: plan.review.reports ?? 0, verifiedBooking: true,
          operatorResponse: plan.review.response ?? null, operatorRespondedAt: plan.review.response ? new Date(reviewedAt.getTime() + 86_400_000) : null,
          createdAt: reviewedAt, updatedAt: reviewedAt,
        })
        .returning();
      reviewIds.push(rev!.id);
      if (plan.review.accommodation && spec?.room) {
        const accom = must(cat.accommodations.get(spec.room.accom), "accommodation");
        const [rev2] = await db
          .insert(schema.reviews)
          .values({
            tenantId: cat.tenantId, userId: customer.id, bookingId, subjectType: "accommodation", subjectId: accom.id, rating: plan.review.accommodation.rating,
            title: plan.review.accommodation.title, body: plan.review.accommodation.body, status: "published", verifiedBooking: true, createdAt: reviewedAt, updatedAt: reviewedAt,
          })
          .returning();
        reviewIds.push(rev2!.id);
      }
    }

    bookingsOut.push({
      id: bookingId, key: plan.key, tenantId: cat.tenantId, tenant: plan.tenant, status, userId: customer.id, userEmail: customer.email, userPhone: customer.phone, packageId: pkg.id,
      packageName: pkg.name, operatorId: pkg.operatorId, currency: pkg.currency, total, createdAt, travelDate, paymentId,
    });
  }

  // ---- seat counts: past dates have no availability row yet, future ones already exist
  for (const { pkg, date, n } of seatDelta.values()) {
    await db
      .insert(schema.packageAvailability)
      .values({ packageId: pkg.id, travelDate: date, totalCapacity: Math.max(pkg.capacity, n), bookedCount: n, status: n >= pkg.capacity ? "sold_out" : "open" })
      .onConflictDoUpdate({
        target: [schema.packageAvailability.packageId, schema.packageAvailability.travelDate],
        set: { bookedCount: sql`${schema.packageAvailability.bookedCount} + ${n}`, updatedAt: new Date() },
      });
  }

  // ---- coupon usage counts follow the bookings that used them
  for (const [couponId, uses] of couponUse) {
    await db.update(schema.coupons).set({ usedCount: sql`${schema.coupons.usedCount} + ${uses}` }).where(sql`${schema.coupons.id} = ${couponId}`);
  }

  return { bookings: bookingsOut, coupons, reviewIds };
}
