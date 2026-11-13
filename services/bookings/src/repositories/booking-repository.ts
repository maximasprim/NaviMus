import { and, desc, eq, inArray, lte, schema, sql, withTenant, withPlatformRLSBypass, scopedInsert, type Database } from "@travel/database";
import type { BookingStatus } from "@travel/types";

export class BookingRepository {
  constructor(private readonly db: Database) {}

  async findByIdempotencyKey(tenantId: string, key: string) {
    const [booking] = await this.db
      .select()
      .from(schema.bookings)
      .where(withTenant(schema.bookings.tenantId, tenantId, eq(schema.bookings.idempotencyKey, key)))
      .limit(1);
    return booking ?? null;
  }

  async findById(tenantId: string, id: string) {
    const [booking] = await this.db
      .select()
      .from(schema.bookings)
      .where(withTenant(schema.bookings.tenantId, tenantId, eq(schema.bookings.id, id)))
      .limit(1);
    return booking ?? null;
  }

  /**
   * Deliberately unscoped - used ONLY by BookingService's admin methods
   * when called by a super_admin (tenantId resolves to null there, see
   * routes.ts). Every other call site must go through the tenant-scoped
   * `findById` above; this one exists so the one legitimate cross-tenant
   * use case doesn't have to work around the tenant filter some other,
   * less obvious way.
   */
  async findByIdUnscoped(id: string) {
    const [booking] = await this.db.select().from(schema.bookings).where(eq(schema.bookings.id, id)).limit(1);
    return booking ?? null;
  }

  async findByIdForUser(tenantId: string, id: string, userId: string) {
    const [booking] = await this.db
      .select()
      .from(schema.bookings)
      .where(withTenant(schema.bookings.tenantId, tenantId, eq(schema.bookings.id, id), eq(schema.bookings.userId, userId)))
      .limit(1);
    return booking ?? null;
  }

  async listForUser(tenantId: string, userId: string) {
    return this.db
      .select()
      .from(schema.bookings)
      .where(withTenant(schema.bookings.tenantId, tenantId, eq(schema.bookings.userId, userId)))
      .orderBy(desc(schema.bookings.createdAt));
  }

  /** Bookings for packages belonging to a given operator - the Partner Portal's booking list. */
  async listForOperator(tenantId: string, operatorId: string) {
    return this.db
      .select({ booking: schema.bookings })
      .from(schema.bookings)
      .innerJoin(schema.packages, eq(schema.bookings.packageId, schema.packages.id))
      .where(withTenant(schema.bookings.tenantId, tenantId, eq(schema.packages.operatorId, operatorId)))
      .orderBy(desc(schema.bookings.createdAt))
      .then((rows) => rows.map((r) => r.booking));
  }

  /**
   * Section 44 (admin: manage bookings) - optionally filtered by status.
   * tenantId is null only for a super_admin's cross-tenant view.
   */
  async listAll(tenantId: string | null, page: number, pageSize: number, status?: BookingStatus) {
    const offset = (page - 1) * pageSize;
    const tenantCondition = tenantId ? eq(schema.bookings.tenantId, tenantId) : undefined;
    const statusCondition = status ? eq(schema.bookings.status, status) : undefined;
    const conditions = and(...[tenantCondition, statusCondition].filter((c): c is NonNullable<typeof c> => Boolean(c)));
    const [items, countRows] = await Promise.all([
      this.db
        .select()
        .from(schema.bookings)
        .where(conditions)
        .orderBy(desc(schema.bookings.createdAt))
        .limit(pageSize)
        .offset(offset),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.bookings)
        .where(conditions),
    ]);
    return { items, total: countRows[0]?.count ?? 0 };
  }

  async getItems(bookingId: string) {
    return this.db.select().from(schema.bookingItems).where(eq(schema.bookingItems.bookingId, bookingId));
  }

  async getTravelers(bookingId: string) {
    return this.db
      .select()
      .from(schema.bookingTravelers)
      .where(eq(schema.bookingTravelers.bookingId, bookingId));
  }

  /** The travelers on a booking WITH their profile details (never the encrypted passport number, only whether one is on file). */
  async getTravelerDetails(bookingId: string) {
    const rows = await this.db
      .select({
        id: schema.bookingTravelers.id,
        travelerId: schema.bookingTravelers.travelerId,
        travelerType: schema.bookingTravelers.travelerType,
        priceAmount: schema.bookingTravelers.priceAmount,
        currency: schema.bookingTravelers.currency,
        firstName: schema.travelers.firstName,
        lastName: schema.travelers.lastName,
        dateOfBirth: schema.travelers.dateOfBirth,
        gender: schema.travelers.gender,
        nationality: schema.travelers.nationality,
        hasPassport: sql<boolean>`${schema.travelers.passportNumberEncrypted} is not null`,
        passportExpiryDate: schema.travelers.passportExpiryDate,
        phone: schema.travelers.phone,
        email: schema.travelers.email,
        emergencyContactName: schema.travelers.emergencyContactName,
        emergencyContactPhone: schema.travelers.emergencyContactPhone,
        dietaryRequirements: schema.travelers.dietaryRequirements,
        accessibilityRequirements: schema.travelers.accessibilityRequirements,
      })
      .from(schema.bookingTravelers)
      .innerJoin(schema.travelers, eq(schema.travelers.id, schema.bookingTravelers.travelerId))
      .where(eq(schema.bookingTravelers.bookingId, bookingId));
    return rows;
  }

  /** Updates the traveler profile behind one line of this booking. Returns null if that line isn't on this booking. */
  async updateTravelerOnBooking(bookingId: string, bookingTravelerId: string, patch: Record<string, unknown>) {
    const [link] = await this.db
      .select({ travelerId: schema.bookingTravelers.travelerId })
      .from(schema.bookingTravelers)
      .where(and(eq(schema.bookingTravelers.id, bookingTravelerId), eq(schema.bookingTravelers.bookingId, bookingId)))
      .limit(1);
    if (!link) return null;
    const [row] = await this.db
      .update(schema.travelers)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(schema.travelers.id, link.travelerId))
      .returning({ id: schema.travelers.id });
    return row ?? null;
  }

  async getStatusHistory(bookingId: string) {
    return this.db
      .select()
      .from(schema.bookingStatusHistory)
      .where(eq(schema.bookingStatusHistory.bookingId, bookingId))
      .orderBy(desc(schema.bookingStatusHistory.createdAt));
  }

  /**
   * Bookings stuck in a pending state past their hold expiry - candidates for
   * the reaper job. The reaper is a system job that sweeps EVERY tenant, with
   * no request or tenant behind it, so this read runs under an explicit RLS
   * bypass (it only reads; the per-booking transitions that follow are
   * performed under their own bypass in releaseExpiredHolds).
   */
  async findExpiredHolds(now: Date, statuses: BookingStatus[] = ["DRAFT", "PENDING_PAYMENT"]) {
    return withPlatformRLSBypass(this.db, (tx) =>
      tx
        .select()
        .from(schema.bookings)
        .where(and(lte(schema.bookings.holdExpiresAt, now), inArray(schema.bookings.status, statuses)))
    );
  }

  async updateDetails(
    id: string,
    patch: { contactEmail?: string; contactPhone?: string; specialRequests?: string | null; travelDate?: string }
  ) {
    const [row] = await this.db
      .update(schema.bookings)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(schema.bookings.id, id))
      .returning();
    return row ?? null;
  }

  async writeAudit(input: { tenantId: string; actorUserId: string; action: string; resourceId: string; metadata?: Record<string, unknown> }) {
    await this.db.insert(schema.auditLogs).values({
      tenantId: input.tenantId,
      actorUserId: input.actorUserId,
      action: input.action,
      resourceType: "booking",
      resourceId: input.resourceId,
      metadata: input.metadata,
    });
  }
}
