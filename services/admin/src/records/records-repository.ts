import { and, asc, desc, eq, ilike, inArray, isNull, or, schema, sql, type Database } from "@travel/database";
import { ConflictError, NotFoundError } from "@travel/types";
import type { ListingKind } from "@travel/validation";

/** A tenant id for a tenant admin, or null for a platform admin (every tenant). */
export type Scope = string | null;

const inScope = (col: any, scope: Scope) => (scope ? eq(col, scope) : undefined);

/** Pages through a query: `rows` for the page and the total count. */
type Page = { page: number; pageSize: number };
const offsetOf = (p: Page) => (p.page - 1) * p.pageSize;

/**
 * Child records that hang off a listing (prices, availability, itinerary days, rooms, vehicles...). One table
 * describes them all so the admin can view and edit every one through the same four endpoints.
 */
export type ChildName =
  | "package-prices"
  | "package-availability"
  | "package-itinerary"
  | "package-inclusions"
  | "package-exclusions"
  | "package-activities"
  | "room-types"
  | "rooms"
  | "vehicles"
  | "routes";

interface ChildDef {
  table: any;
  parent: ListingKind | "roomType";
  parentCol: string;
  softDelete?: boolean;
  order: (t: any) => any[];
  canCreate: boolean;
}

const CHILDREN: Record<ChildName, ChildDef> = {
  "package-prices": { table: schema.packagePrices, parent: "package", parentCol: "packageId", order: (t) => [asc(t.travelerType), asc(t.seasonStartDate)], canCreate: true },
  "package-availability": { table: schema.packageAvailability, parent: "package", parentCol: "packageId", order: (t) => [asc(t.travelDate)], canCreate: true },
  "package-itinerary": { table: schema.packageItineraries, parent: "package", parentCol: "packageId", order: (t) => [asc(t.dayNumber)], canCreate: true },
  "package-inclusions": { table: schema.packageInclusions, parent: "package", parentCol: "packageId", order: (t) => [asc(t.label)], canCreate: true },
  "package-exclusions": { table: schema.packageExclusions, parent: "package", parentCol: "packageId", order: (t) => [asc(t.label)], canCreate: true },
  "package-activities": { table: schema.packageActivities, parent: "package", parentCol: "packageId", order: (t) => [asc(t.name)], canCreate: true },
  "room-types": { table: schema.roomTypes, parent: "accommodation", parentCol: "accommodationId", softDelete: true, order: (t) => [asc(t.name)], canCreate: true },
  rooms: { table: schema.rooms, parent: "roomType", parentCol: "roomTypeId", order: (t) => [asc(t.roomNumber)], canCreate: true },
  vehicles: { table: schema.vehicles, parent: "transport", parentCol: "transportProviderId", softDelete: true, order: (t) => [asc(t.name)], canCreate: true },
  // Routes are edited (price, duration) and removed, but created in the operator's own portal where the cities are picked.
  routes: { table: schema.transportRoutes, parent: "transport", parentCol: "transportProviderId", order: (t) => [asc(t.createdAt)], canCreate: false },
};

export const CHILD_NAMES = Object.keys(CHILDREN) as ChildName[];
export const childCanCreate = (name: ChildName) => CHILDREN[name].canCreate;

/** Postgres unique-violation, however the driver wraps it. */
function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === "23505" || e?.cause?.code === "23505";
}

export class RecordsRepository {
  constructor(private readonly db: Database) {}

  // ===================== Audit history of any record =====================
  async history(scope: Scope, resourceType: string, resourceId: string, p: Page) {
    const a = schema.auditLogs;
    const where = and(eq(a.resourceType, resourceType), eq(a.resourceId, resourceId), inScope(a.tenantId, scope));
    const [items, count] = await Promise.all([
      this.db
        .select({
          id: a.id,
          action: a.action,
          metadata: a.metadata,
          createdAt: a.createdAt,
          actorUserId: a.actorUserId,
          actorEmail: schema.users.email,
          actorFirstName: schema.users.firstName,
          actorLastName: schema.users.lastName,
        })
        .from(a)
        .leftJoin(schema.users, eq(a.actorUserId, schema.users.id))
        .where(where)
        .orderBy(desc(a.createdAt))
        .limit(p.pageSize)
        .offset(offsetOf(p)),
      this.db.select({ count: sql<number>`count(*)::int` }).from(a).where(where),
    ]);
    return { items, total: count[0]?.count ?? 0 };
  }

  async writeAudit(input: { tenantId: string; actorUserId: string; action: string; resourceType: string; resourceId: string; metadata?: Record<string, unknown> }) {
    await this.db.insert(schema.auditLogs).values(input);
  }

  // ===================== Payments =====================
  async listPayments(scope: Scope, q: Page & { status?: string; provider?: string; search?: string }) {
    const t = schema.payments;
    const where = and(
      inScope(t.tenantId, scope),
      q.status ? eq(t.status, q.status) : undefined,
      q.provider ? eq(t.provider, q.provider) : undefined,
      q.search ? or(ilike(t.providerReceipt, `%${q.search}%`), sql`${t.bookingId}::text ilike ${q.search + "%"}`, sql`${t.id}::text ilike ${q.search + "%"}`) : undefined
    );
    const [items, count] = await Promise.all([
      this.db
        .select({
          id: t.id,
          bookingId: t.bookingId,
          provider: t.provider,
          status: t.status,
          originalAmount: t.originalAmount,
          originalCurrency: t.originalCurrency,
          baseCurrencyAmount: t.baseCurrencyAmount,
          baseCurrency: t.baseCurrency,
          providerReceipt: t.providerReceipt,
          createdAt: t.createdAt,
        })
        .from(t)
        .where(where)
        .orderBy(desc(t.createdAt))
        .limit(q.pageSize)
        .offset(offsetOf(q)),
      this.db.select({ count: sql<number>`count(*)::int` }).from(t).where(where),
    ]);
    return { items, total: count[0]?.count ?? 0 };
  }

  async getPayment(scope: Scope, id: string) {
    const [payment] = await this.db.select().from(schema.payments).where(and(eq(schema.payments.id, id), inScope(schema.payments.tenantId, scope))).limit(1);
    if (!payment) throw new NotFoundError("Payment");
    const [transactions, refunds, bookingRows] = await Promise.all([
      this.db.select({ id: schema.paymentTransactions.id, providerReference: schema.paymentTransactions.providerReference, createdAt: schema.paymentTransactions.createdAt }).from(schema.paymentTransactions).where(eq(schema.paymentTransactions.paymentId, id)).orderBy(desc(schema.paymentTransactions.createdAt)),
      this.db.select().from(schema.paymentRefunds).where(eq(schema.paymentRefunds.paymentId, id)).orderBy(desc(schema.paymentRefunds.createdAt)),
      this.db
        .select({
          id: schema.bookings.id,
          status: schema.bookings.status,
          contactEmail: schema.bookings.contactEmail,
          userId: schema.bookings.userId,
          totalAmount: schema.bookings.totalAmount,
          amountPaid: schema.bookings.amountPaid,
          currency: schema.bookings.currency,
        })
        .from(schema.bookings)
        .where(eq(schema.bookings.id, payment.bookingId))
        .limit(1),
    ]);
    return { ...payment, transactions, refunds, booking: bookingRows[0] ?? null };
  }

  // ===================== Invoices =====================
  async listInvoices(scope: Scope, q: Page & { search?: string; unpaidOnly?: boolean }) {
    const t = schema.invoices;
    const where = and(
      inScope(t.tenantId, scope),
      q.search ? or(ilike(t.invoiceNumber, `%${q.search}%`), ilike(schema.bookings.contactEmail, `%${q.search}%`)) : undefined,
      q.unpaidOnly ? sql`${t.balanceDue} > 0` : undefined
    );
    const [items, count] = await Promise.all([
      this.db
        .select({
          id: t.id,
          invoiceNumber: t.invoiceNumber,
          bookingId: t.bookingId,
          contactEmail: schema.bookings.contactEmail,
          totalAmount: t.totalAmount,
          amountPaid: t.amountPaid,
          balanceDue: t.balanceDue,
          currency: t.currency,
          createdAt: t.createdAt,
        })
        .from(t)
        .leftJoin(schema.bookings, eq(t.bookingId, schema.bookings.id))
        .where(where)
        .orderBy(desc(t.createdAt))
        .limit(q.pageSize)
        .offset(offsetOf(q)),
      this.db.select({ count: sql<number>`count(*)::int` }).from(t).leftJoin(schema.bookings, eq(t.bookingId, schema.bookings.id)).where(where),
    ]);
    return { items, total: count[0]?.count ?? 0 };
  }

  /** Billing events recorded for one tenant (subscription payments, plan changes), newest first. */
  async tenantBillingEvents(tenantId: string, limit = 25) {
    const t = schema.billingEvents;
    return this.db
      .select({ id: t.id, type: t.type, outcome: t.outcome, createdAt: t.createdAt })
      .from(t)
      .where(eq(t.tenantId, tenantId))
      .orderBy(desc(t.createdAt))
      .limit(limit);
  }

  // ===================== Reviews =====================
  async listReviews(scope: Scope, q: Page & { status?: string; rating?: number; reportedOnly?: boolean; search?: string }) {
    const t = schema.reviews;
    const where = and(
      inScope(t.tenantId, scope),
      q.status ? eq(t.status, q.status) : undefined,
      q.rating ? eq(t.rating, q.rating) : undefined,
      q.reportedOnly ? sql`${t.reportCount} > 0` : undefined,
      q.search ? or(ilike(t.title, `%${q.search}%`), ilike(t.body, `%${q.search}%`)) : undefined
    );
    const [items, count] = await Promise.all([
      this.db
        .select({
          id: t.id,
          userId: t.userId,
          userEmail: schema.users.email,
          userFirstName: schema.users.firstName,
          userLastName: schema.users.lastName,
          bookingId: t.bookingId,
          subjectType: t.subjectType,
          subjectId: t.subjectId,
          rating: t.rating,
          title: t.title,
          body: t.body,
          status: t.status,
          reportCount: t.reportCount,
          operatorResponse: t.operatorResponse,
          createdAt: t.createdAt,
        })
        .from(t)
        .leftJoin(schema.users, eq(t.userId, schema.users.id))
        .where(where)
        .orderBy(desc(t.reportCount), desc(t.createdAt))
        .limit(q.pageSize)
        .offset(offsetOf(q)),
      this.db.select({ count: sql<number>`count(*)::int` }).from(t).where(where),
    ]);
    return { items, total: count[0]?.count ?? 0 };
  }

  // ===================== Coupons =====================
  async listCoupons(scope: Scope, q: Page & { search?: string; active?: boolean }) {
    const t = schema.coupons;
    const where = and(
      inScope(t.tenantId, scope),
      q.search ? ilike(t.code, `%${q.search}%`) : undefined,
      q.active === undefined ? undefined : eq(t.isActive, q.active)
    );
    const [items, count] = await Promise.all([
      this.db.select().from(t).where(where).orderBy(desc(t.createdAt)).limit(q.pageSize).offset(offsetOf(q)),
      this.db.select({ count: sql<number>`count(*)::int` }).from(t).where(where),
    ]);
    return { items, total: count[0]?.count ?? 0 };
  }

  async createCoupon(tenantId: string, values: Record<string, unknown>) {
    try {
      const [row] = await this.db.insert(schema.coupons).values({ ...values, tenantId } as any).returning();
      return row!;
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictError("A coupon with that code already exists");
      throw err;
    }
  }

  async updateCoupon(scope: Scope, id: string, values: Record<string, unknown>) {
    try {
      const [row] = await this.db
        .update(schema.coupons)
        .set({ ...values, updatedAt: new Date() } as any)
        .where(and(eq(schema.coupons.id, id), inScope(schema.coupons.tenantId, scope)))
        .returning();
      return row ?? null;
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictError("A coupon with that code already exists");
      throw err;
    }
  }

  /** A coupon that has been used stays (customers' bookings reference it); only unused ones can be removed. */
  async deleteCoupon(scope: Scope, id: string) {
    const [existing] = await this.db.select().from(schema.coupons).where(and(eq(schema.coupons.id, id), inScope(schema.coupons.tenantId, scope))).limit(1);
    if (!existing) return null;
    if (existing.usedCount > 0) throw new ConflictError("This coupon has been used, so it can't be deleted. Deactivate it instead.");
    await this.db.delete(schema.coupons).where(eq(schema.coupons.id, id));
    return existing;
  }

  // ===================== Promotions (campaigns) =====================
  async listPromotions(scope: Scope) {
    const t = schema.promotions;
    const promos = await this.db.select().from(t).where(inScope(t.tenantId, scope)).orderBy(desc(t.createdAt));
    if (promos.length === 0) return [];
    const rules = await this.db
      .select()
      .from(schema.discounts)
      .where(inArray(schema.discounts.promotionId, promos.map((p) => p.id)));
    return promos.map((p) => ({ ...p, rules: rules.filter((r) => r.promotionId === p.id) }));
  }

  async createPromotion(tenantId: string, values: Record<string, unknown>, rules: Record<string, unknown>[]) {
    return this.db.transaction(async (tx) => {
      const [promo] = await tx.insert(schema.promotions).values({ ...values, tenantId } as any).returning();
      if (rules.length) await tx.insert(schema.discounts).values(rules.map((r) => ({ ...r, promotionId: promo!.id })) as any);
      return promo!;
    });
  }

  async updatePromotion(scope: Scope, id: string, values: Record<string, unknown>) {
    const [row] = await this.db
      .update(schema.promotions)
      .set({ ...values, updatedAt: new Date() } as any)
      .where(and(eq(schema.promotions.id, id), inScope(schema.promotions.tenantId, scope)))
      .returning();
    return row ?? null;
  }

  async deletePromotion(scope: Scope, id: string) {
    const [existing] = await this.db.select().from(schema.promotions).where(and(eq(schema.promotions.id, id), inScope(schema.promotions.tenantId, scope))).limit(1);
    if (!existing) return null;
    await this.db.transaction(async (tx) => {
      await tx.delete(schema.discounts).where(eq(schema.discounts.promotionId, id));
      await tx.delete(schema.promotions).where(eq(schema.promotions.id, id));
    });
    return existing;
  }

  async addPromotionRule(scope: Scope, promotionId: string, rule: Record<string, unknown>) {
    const [promo] = await this.db.select({ id: schema.promotions.id }).from(schema.promotions).where(and(eq(schema.promotions.id, promotionId), inScope(schema.promotions.tenantId, scope))).limit(1);
    if (!promo) return null;
    const [row] = await this.db.insert(schema.discounts).values({ ...rule, promotionId } as any).returning();
    return row!;
  }

  async deletePromotionRule(scope: Scope, ruleId: string) {
    const [rule] = await this.db
      .select({ id: schema.discounts.id })
      .from(schema.discounts)
      .innerJoin(schema.promotions, eq(schema.discounts.promotionId, schema.promotions.id))
      .where(and(eq(schema.discounts.id, ruleId), inScope(schema.promotions.tenantId, scope)))
      .limit(1);
    if (!rule) return false;
    await this.db.delete(schema.discounts).where(eq(schema.discounts.id, ruleId));
    return true;
  }

  // ===================== Overviews: everything linked to one user / operator =====================
  async userOverview(scope: Scope, userId: string) {
    const [user] = await this.db.select({ id: schema.users.id, tenantId: schema.users.tenantId }).from(schema.users).where(and(eq(schema.users.id, userId), inScope(schema.users.tenantId, scope))).limit(1);
    if (!user) throw new NotFoundError("User");
    const b = schema.bookings;
    const [bookings, payments, travelers, reviewCount] = await Promise.all([
      this.db
        .select({
          id: b.id,
          status: b.status,
          travelDate: b.travelDate,
          totalAmount: b.totalAmount,
          amountPaid: b.amountPaid,
          currency: b.currency,
          packageName: schema.packages.name,
          createdAt: b.createdAt,
        })
        .from(b)
        .leftJoin(schema.packages, eq(b.packageId, schema.packages.id))
        .where(eq(b.userId, userId))
        .orderBy(desc(b.createdAt))
        .limit(25),
      this.db
        .select({
          id: schema.payments.id,
          bookingId: schema.payments.bookingId,
          provider: schema.payments.provider,
          status: schema.payments.status,
          originalAmount: schema.payments.originalAmount,
          originalCurrency: schema.payments.originalCurrency,
          createdAt: schema.payments.createdAt,
        })
        .from(schema.payments)
        .innerJoin(b, eq(schema.payments.bookingId, b.id))
        .where(eq(b.userId, userId))
        .orderBy(desc(schema.payments.createdAt))
        .limit(25),
      // Passport numbers are never sent to the browser: only whether one is on file.
      this.db
        .select({
          id: schema.travelers.id,
          firstName: schema.travelers.firstName,
          lastName: schema.travelers.lastName,
          dateOfBirth: schema.travelers.dateOfBirth,
          nationality: schema.travelers.nationality,
          email: schema.travelers.email,
          phone: schema.travelers.phone,
          hasPassport: sql<boolean>`${schema.travelers.passportNumberEncrypted} is not null`,
          passportExpiryDate: schema.travelers.passportExpiryDate,
          dietaryRequirements: schema.travelers.dietaryRequirements,
        })
        .from(schema.travelers)
        .where(eq(schema.travelers.ownerUserId, userId)),
      this.db.select({ count: sql<number>`count(*)::int` }).from(schema.reviews).where(eq(schema.reviews.userId, userId)),
    ]);
    return { bookings, payments, travelers, reviewCount: reviewCount[0]?.count ?? 0 };
  }

  async operatorOverview(scope: Scope, operatorId: string) {
    const [op] = await this.db.select({ id: schema.operators.id }).from(schema.operators).where(and(eq(schema.operators.id, operatorId), inScope(schema.operators.tenantId, scope))).limit(1);
    if (!op) throw new NotFoundError("Operator");
    const [packages, accommodations, transportProviders, recentBookings] = await Promise.all([
      this.db
        .select({
          id: schema.packages.id,
          name: schema.packages.name,
          status: schema.packages.status,
          featured: schema.packages.featured,
          durationDays: schema.packages.durationDays,
          bookings: sql<number>`(select count(*)::int from ${schema.bookings} where ${schema.bookings.packageId} = ${schema.packages.id})`,
        })
        .from(schema.packages)
        .where(and(eq(schema.packages.operatorId, operatorId), isNull(schema.packages.deletedAt)))
        .orderBy(desc(schema.packages.createdAt)),
      this.db
        .select({ id: schema.accommodations.id, name: schema.accommodations.name, type: schema.accommodations.type, status: schema.accommodations.status })
        .from(schema.accommodations)
        .where(and(eq(schema.accommodations.operatorId, operatorId), isNull(schema.accommodations.deletedAt))),
      this.db
        .select({ id: schema.transportProviders.id, name: schema.transportProviders.name, contactPhone: schema.transportProviders.contactPhone })
        .from(schema.transportProviders)
        .where(and(eq(schema.transportProviders.operatorId, operatorId), isNull(schema.transportProviders.deletedAt))),
      this.db
        .select({
          id: schema.bookings.id,
          status: schema.bookings.status,
          travelDate: schema.bookings.travelDate,
          totalAmount: schema.bookings.totalAmount,
          currency: schema.bookings.currency,
          packageName: schema.packages.name,
          createdAt: schema.bookings.createdAt,
        })
        .from(schema.bookings)
        .innerJoin(schema.packages, eq(schema.bookings.packageId, schema.packages.id))
        .where(eq(schema.packages.operatorId, operatorId))
        .orderBy(desc(schema.bookings.createdAt))
        .limit(15),
    ]);
    return { packages, accommodations, transportProviders, recentBookings };
  }

  // ===================== Full listing detail =====================
  private parentTable(kind: ListingKind): any {
    switch (kind) {
      case "destination": return schema.destinations;
      case "package": return schema.packages;
      case "accommodation": return schema.accommodations;
      case "transport": return schema.transportProviders;
    }
  }

  private async findParent(kind: ListingKind, scope: Scope, id: string): Promise<any | null> {
    const t = this.parentTable(kind);
    const [row] = await this.db.select().from(t).where(and(eq(t.id, id), isNull(t.deletedAt), inScope(t.tenantId, scope))).limit(1);
    return row ?? null;
  }

  /** The listing itself, with the extra facts its page needs (operator, city, vehicle-type catalogue). */
  async getListingFull(kind: ListingKind, scope: Scope, id: string) {
    const row = await this.findParent(kind, scope, id);
    if (!row) throw new NotFoundError(kind);
    const extra: Record<string, unknown> = {};
    if (row.operatorId) {
      const [op] = await this.db.select({ id: schema.operators.id, businessName: schema.operators.businessName }).from(schema.operators).where(eq(schema.operators.id, row.operatorId)).limit(1);
      extra.operator = op ?? null;
    }
    if (kind === "accommodation" && row.cityId) {
      const [city] = await this.db.select({ id: schema.cities.id, name: schema.cities.name }).from(schema.cities).where(eq(schema.cities.id, row.cityId)).limit(1);
      extra.city = city ?? null;
    }
    if (kind === "transport") {
      extra.vehicleTypes = await this.db
        .select({ id: schema.vehicleTypes.id, name: schema.vehicleTypes.name })
        .from(schema.vehicleTypes)
        .where(inScope(schema.vehicleTypes.tenantId, scope ?? row.tenantId))
        .orderBy(asc(schema.vehicleTypes.name));
    }
    return { ...row, ...extra };
  }

  /** Edits the listing's own fields (the route has already limited them to what this kind has). */
  async updateListingFields(kind: ListingKind, scope: Scope, id: string, values: Record<string, unknown>) {
    const t = this.parentTable(kind);
    if (values.status === "published" && "publishedAt" in t) values.publishedAt = new Date();
    const [row] = await this.db
      .update(t)
      .set({ ...values, updatedAt: new Date() })
      .where(and(eq(t.id, id), isNull(t.deletedAt), inScope(t.tenantId, scope)))
      .returning();
    return (row as any) ?? null;
  }

  // ===================== Child records =====================
  /** True if the parent of a child (a listing, or a room type inside an accommodation) is inside the caller's reach. */
  private async parentInReach(def: ChildDef, parentId: string, scope: Scope): Promise<{ tenantId: string; kind: ListingKind; rootId: string } | null> {
    if (def.parent === "roomType") {
      const [rt] = await this.db.select({ accommodationId: schema.roomTypes.accommodationId }).from(schema.roomTypes).where(eq(schema.roomTypes.id, parentId)).limit(1);
      if (!rt) return null;
      const acc = await this.findParent("accommodation", scope, rt.accommodationId);
      return acc ? { tenantId: acc.tenantId, kind: "accommodation", rootId: acc.id } : null;
    }
    const row = await this.findParent(def.parent, scope, parentId);
    return row ? { tenantId: row.tenantId, kind: def.parent, rootId: row.id } : null;
  }

  async listChildren(name: ChildName, scope: Scope, parentId: string) {
    const def = CHILDREN[name];
    if (!(await this.parentInReach(def, parentId, scope))) throw new NotFoundError("Record");
    const t = def.table;
    const rows = await this.db
      .select()
      .from(t)
      .where(and(eq(t[def.parentCol], parentId), def.softDelete ? isNull(t.deletedAt) : undefined))
      .orderBy(...def.order(t));
    if (name !== "room-types") return rows;
    // Rooms ride along with their room type so the page shows them together.
    const ids = rows.map((r: any) => r.id);
    const rooms = ids.length ? await this.db.select().from(schema.rooms).where(inArray(schema.rooms.roomTypeId, ids)).orderBy(asc(schema.rooms.roomNumber)) : [];
    return rows.map((r: any) => ({ ...r, rooms: rooms.filter((x) => x.roomTypeId === r.id) }));
  }

  async createChild(name: ChildName, scope: Scope, parentId: string, values: Record<string, unknown>) {
    const def = CHILDREN[name];
    const reach = await this.parentInReach(def, parentId, scope);
    if (!reach) throw new NotFoundError("Record");
    try {
      const [row] = await this.db.insert(def.table).values({ ...values, [def.parentCol]: parentId }).returning();
      return { row, ...reach, parentId };
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictError("That already exists (for example, that day or date is already set)");
      throw err;
    }
  }

  private async findChild(def: ChildDef, scope: Scope, id: string) {
    const t = def.table;
    const [row] = await this.db.select().from(t).where(and(eq(t.id, id), def.softDelete ? isNull(t.deletedAt) : undefined)).limit(1);
    if (!row) return null;
    const reach = await this.parentInReach(def, (row as any)[def.parentCol], scope);
    return reach ? { row: row as any, ...reach, parentId: (row as any)[def.parentCol] as string } : null;
  }

  async updateChild(name: ChildName, scope: Scope, id: string, values: Record<string, unknown>) {
    const def = CHILDREN[name];
    const found = await this.findChild(def, scope, id);
    if (!found) throw new NotFoundError("Record");
    // Capacity can't drop below what's already booked.
    if (name === "package-availability" && typeof values.totalCapacity === "number" && values.totalCapacity < found.row.bookedCount) {
      throw new ConflictError(`${found.row.bookedCount} seats are already booked for that date, so capacity can't go below that`);
    }
    try {
      const [row] = await this.db.update(def.table).set(values).where(eq(def.table.id, id)).returning();
      return { row, ...found };
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictError("That already exists (for example, that day or date is already set)");
      throw err;
    }
  }

  async deleteChild(name: ChildName, scope: Scope, id: string) {
    const def = CHILDREN[name];
    const found = await this.findChild(def, scope, id);
    if (!found) throw new NotFoundError("Record");
    if (name === "package-availability" && found.row.bookedCount > 0) {
      throw new ConflictError("This date already has bookings, so it can't be removed. Close it instead.");
    }
    if (def.softDelete) {
      await this.db.update(def.table).set({ deletedAt: new Date() }).where(eq(def.table.id, id));
    } else {
      await this.db.delete(def.table).where(eq(def.table.id, id));
    }
    return found;
  }
}
