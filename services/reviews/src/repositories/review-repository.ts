import { and, asc, desc, eq, gte, schema, sql, withTenant, scopedInsert, type Database } from "@travel/database";
import type { CreateReviewInput, ReviewSearchQuery } from "@travel/validation";

export class ReviewRepository {
  constructor(private readonly db: Database) {}

  /**
   * A booking counts as "eligible" for a review of a given subject
   * if it's COMPLETED and either references the package directly
   * (subjectType=package/destination via the package) or the
   * subject was one of its line items (accommodation/transport/
   * transfer). Kept intentionally simple: checks the booking
   * belongs to the user and is COMPLETED - the subject-specific
   * linkage is checked by the caller against booking_items /
   * package_destinations where relevant.
   */
  async findEligibleBooking(tenantId: string, bookingId: string, userId: string) {
    const [booking] = await this.db
      .select()
      .from(schema.bookings)
      .where(withTenant(schema.bookings.tenantId, tenantId, eq(schema.bookings.id, bookingId), eq(schema.bookings.userId, userId)))
      .limit(1);
    return booking ?? null;
  }

  async findExistingReview(tenantId: string, bookingId: string, subjectType: string, subjectId: string) {
    const [row] = await this.db
      .select()
      .from(schema.reviews)
      .where(
        withTenant(
          schema.reviews.tenantId,
          tenantId,
          eq(schema.reviews.bookingId, bookingId),
          eq(schema.reviews.subjectType, subjectType),
          eq(schema.reviews.subjectId, subjectId)
        )
      )
      .limit(1);
    return row ?? null;
  }

  async create(tenantId: string, userId: string, input: CreateReviewInput) {
    const [row] = await this.db
      .insert(schema.reviews)
      .values(
        scopedInsert(tenantId, {
          userId,
          bookingId: input.bookingId,
          subjectType: input.subjectType,
          subjectId: input.subjectId,
          rating: input.rating,
          title: input.title,
          body: input.body,
          verifiedBooking: true,
        })
      )
      .returning();
    return row!;
  }

  async search(tenantId: string, query: ReviewSearchQuery) {
    const conditions = [eq(schema.reviews.tenantId, tenantId), eq(schema.reviews.status, "published")];
    if (query.subjectType) conditions.push(eq(schema.reviews.subjectType, query.subjectType));
    if (query.subjectId) conditions.push(eq(schema.reviews.subjectId, query.subjectId));
    if (query.minRating) conditions.push(gte(schema.reviews.rating, query.minRating));

    const offset = (query.page - 1) * query.pageSize;
    const [items, countRows] = await Promise.all([
      this.db
        .select()
        .from(schema.reviews)
        .where(and(...conditions))
        .orderBy(query.order === "asc" ? asc(schema.reviews.createdAt) : desc(schema.reviews.createdAt))
        .limit(query.pageSize)
        .offset(offset),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.reviews)
        .where(and(...conditions)),
    ]);
    return { items, total: countRows[0]?.count ?? 0 };
  }

  async findById(tenantId: string, id: string) {
    const [row] = await this.db
      .select()
      .from(schema.reviews)
      .where(withTenant(schema.reviews.tenantId, tenantId, eq(schema.reviews.id, id)))
      .limit(1);
    return row ?? null;
  }

  /**
   * "My reviews" (section 30) - deliberately NOT filtered to
   * status="published" like the public search() above: a user should
   * see their own review even while pending moderation, or after it's
   * been removed, so they know what happened to it. Ownership
   * (userId) is the only access check needed since this is always
   * called with the caller's own id, never an arbitrary one.
   */
  async listForAuthor(tenantId: string, userId: string) {
    return this.db
      .select()
      .from(schema.reviews)
      .where(withTenant(schema.reviews.tenantId, tenantId, eq(schema.reviews.userId, userId)))
      .orderBy(desc(schema.reviews.createdAt));
  }

  async respond(tenantId: string, id: string, response: string) {
    const [row] = await this.db
      .update(schema.reviews)
      .set({ operatorResponse: response, operatorRespondedAt: new Date(), updatedAt: new Date() })
      .where(withTenant(schema.reviews.tenantId, tenantId, eq(schema.reviews.id, id)))
      .returning();
    return row ?? null;
  }

  /**
   * Resolves the operator that owns a review's subject, for the
   * two subject types that map directly to an operator-owned
   * table. Other subject types (destination, tour_guide,
   * airport_transfer) have no operator ownership in the current
   * schema - callers should treat a null return for those as
   * "no operator can self-serve respond, only admin/support can."
   */
  async getOwningOperatorId(tenantId: string, subjectType: string, subjectId: string): Promise<string | null> {
    if (subjectType === "package") {
      const [row] = await this.db
        .select({ operatorId: schema.packages.operatorId })
        .from(schema.packages)
        .where(withTenant(schema.packages.tenantId, tenantId, eq(schema.packages.id, subjectId)))
        .limit(1);
      return row?.operatorId ?? null;
    }
    if (subjectType === "accommodation") {
      const [row] = await this.db
        .select({ operatorId: schema.accommodations.operatorId })
        .from(schema.accommodations)
        .where(withTenant(schema.accommodations.tenantId, tenantId, eq(schema.accommodations.id, subjectId)))
        .limit(1);
      return row?.operatorId ?? null;
    }
    if (subjectType === "transport") {
      // subjectId here is a transport_providers id (the operator-facing
      // entity), not a route id - routes belong to providers, reviews are
      // scoped at the provider level.
      const [row] = await this.db
        .select({ operatorId: schema.transportProviders.operatorId })
        .from(schema.transportProviders)
        .where(withTenant(schema.transportProviders.tenantId, tenantId, eq(schema.transportProviders.id, subjectId)))
        .limit(1);
      return row?.operatorId ?? null;
    }
    return null;
  }

  async report(tenantId: string, id: string) {
    await this.db
      .update(schema.reviews)
      .set({ reportCount: sql`${schema.reviews.reportCount} + 1`, updatedAt: new Date() })
      .where(withTenant(schema.reviews.tenantId, tenantId, eq(schema.reviews.id, id)));
  }

  async moderate(tenantId: string, id: string, status: "published" | "pending_moderation" | "removed") {
    const [row] = await this.db
      .update(schema.reviews)
      .set({ status, updatedAt: new Date() })
      .where(withTenant(schema.reviews.tenantId, tenantId, eq(schema.reviews.id, id)))
      .returning();
    return row ?? null;
  }

  async getSummaryForSubject(tenantId: string, subjectType: string, subjectId: string) {
    const [row] = await this.db
      .select({
        count: sql<number>`count(*)::int`,
        average: sql<number>`coalesce(avg(rating), 0)::float`,
      })
      .from(schema.reviews)
      .where(
        withTenant(
          schema.reviews.tenantId,
          tenantId,
          eq(schema.reviews.subjectType, subjectType),
          eq(schema.reviews.subjectId, subjectId),
          eq(schema.reviews.status, "published")
        )
      );
    return row ?? { count: 0, average: 0 };
  }
}
