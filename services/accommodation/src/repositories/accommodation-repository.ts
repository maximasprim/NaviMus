import { and, asc, desc, eq, isNull, schema, sql, withTenant, scopedInsert, type Database } from "@travel/database";
import type { AccommodationSearchQuery, CreateAccommodationInput, CreateRoomTypeInput } from "@travel/validation";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export class AccommodationRepository {
  constructor(private readonly db: Database) {}

  async search(tenantId: string, query: AccommodationSearchQuery) {
    const conditions = [
      eq(schema.accommodations.tenantId, tenantId),
      isNull(schema.accommodations.deletedAt),
      eq(schema.accommodations.status, "published"),
    ];
    if (query.cityId) conditions.push(eq(schema.accommodations.cityId, query.cityId));
    if (query.type) conditions.push(eq(schema.accommodations.type, query.type));

    const offset = (query.page - 1) * query.pageSize;
    const [items, countRows] = await Promise.all([
      this.db
        .select()
        .from(schema.accommodations)
        .where(and(...conditions))
        .orderBy(query.order === "asc" ? asc(schema.accommodations.createdAt) : desc(schema.accommodations.createdAt))
        .limit(query.pageSize)
        .offset(offset),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.accommodations)
        .where(and(...conditions)),
    ]);
    return { items, total: countRows[0]?.count ?? 0 };
  }

  async findById(tenantId: string, id: string) {
    const [row] = await this.db
      .select()
      .from(schema.accommodations)
      .where(withTenant(schema.accommodations.tenantId, tenantId, eq(schema.accommodations.id, id), isNull(schema.accommodations.deletedAt)))
      .limit(1);
    if (!row) return null;
    const roomTypes = await this.db
      .select()
      .from(schema.roomTypes)
      .where(and(eq(schema.roomTypes.accommodationId, id), isNull(schema.roomTypes.deletedAt)));
    return { ...row, roomTypes };
  }

  async create(tenantId: string, operatorId: string, input: CreateAccommodationInput) {
    const slug = input.slug ?? slugify(input.name);
    const [row] = await this.db
      .insert(schema.accommodations)
      .values(
        scopedInsert(tenantId, {
          operatorId,
          cityId: input.cityId,
          name: input.name,
          slug,
          type: input.type,
          description: input.description,
          starRating: input.starRating,
          amenities: input.amenities,
          checkInTime: input.checkInTime,
          checkOutTime: input.checkOutTime,
        })
      )
      .returning();
    return row!;
  }

  /** Section 28 (partner portal: manage accommodation) - the create endpoint had no matching "see what I've created" list. */
  async listForOperator(tenantId: string, operatorId: string) {
    return this.db
      .select()
      .from(schema.accommodations)
      .where(withTenant(schema.accommodations.tenantId, tenantId, eq(schema.accommodations.operatorId, operatorId), isNull(schema.accommodations.deletedAt)))
      .orderBy(desc(schema.accommodations.createdAt));
  }

  async addRoomType(accommodationId: string, input: CreateRoomTypeInput) {
    const [row] = await this.db
      .insert(schema.roomTypes)
      .values({
        accommodationId,
        name: input.name,
        maxOccupancy: input.maxOccupancy,
        basePricePerNight: input.basePricePerNight.toFixed(2),
        currency: input.currency,
        mealPlan: input.mealPlan,
      })
      .returning();
    return row!;
  }

  /**
   * Joins through to accommodations to enforce tenant scoping -
   * room_types itself has no tenant_id column (it's a child of
   * accommodations, per the Phase 1 schema decision to not duplicate
   * tenant_id onto every child table). This is the one place that
   * matters most: it's what a booking's reserveRoomsTx call goes
   * through, so it's what actually stops a Tenant A booking from
   * reserving a Tenant B room type.
   */
  async findRoomType(tenantId: string, roomTypeId: string) {
    const [row] = await this.db
      .select({ roomType: schema.roomTypes })
      .from(schema.roomTypes)
      .innerJoin(schema.accommodations, eq(schema.accommodations.id, schema.roomTypes.accommodationId))
      .where(and(eq(schema.roomTypes.id, roomTypeId), eq(schema.accommodations.tenantId, tenantId)))
      .limit(1);
    return row?.roomType ?? null;
  }

  /** Total physical rooms of this type - the ceiling against which nightly overlapping bookings are checked. */
  async countRoomsOfType(roomTypeId: string): Promise<number> {
    const rows = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.rooms)
      .where(and(eq(schema.rooms.roomTypeId, roomTypeId), eq(schema.rooms.isActive, true)));
    return rows[0]?.count ?? 0;
  }

  /**
   * Sum of rooms already held/confirmed for a room type on any
   * night that overlaps [checkIn, checkOut). Used inside a
   * transaction alongside countRoomsOfType to check whether
   * `roomsRequested` more rooms fit.
   */
  async getOverlappingBookedRooms(tx: Database, roomTypeId: string, checkIn: string, checkOut: string): Promise<number> {
    const result = await tx.execute(sql`
      SELECT COALESCE(SUM(rooms_booked), 0)::int AS total
      FROM accommodation_bookings
      WHERE room_type_id = ${roomTypeId}
        AND status IN ('held', 'confirmed')
        AND check_in_date < ${checkOut}
        AND check_out_date > ${checkIn}
      FOR UPDATE
    `);
    const row = (result as unknown as Array<{ total: number }>)[0];
    return row?.total ?? 0;
  }

  async createAccommodationBookingTx(
    tx: Database,
    input: {
      roomTypeId: string;
      bookingId: string | null;
      checkInDate: string;
      checkOutDate: string;
      roomsBooked: number;
      pricePerNight: number;
      currency: string;
    }
  ) {
    const [row] = await tx
      .insert(schema.accommodationBookings)
      .values({
        roomTypeId: input.roomTypeId,
        bookingId: input.bookingId,
        checkInDate: input.checkInDate,
        checkOutDate: input.checkOutDate,
        roomsBooked: input.roomsBooked,
        pricePerNight: input.pricePerNight.toFixed(2),
        currency: input.currency,
        status: "held",
      })
      .returning();
    return row!;
  }
}
