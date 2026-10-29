import { and, eq, isNull, schema, sql, withTenant, scopedInsert, type Database } from "@travel/database";
import type { CreateTransportRouteInput } from "@travel/validation";

export class TransportRepository {
  constructor(private readonly db: Database) {}

  /**
   * A transport_route belongs to a transport_providers row, which
   * in turn belongs to an operator - not directly to the operator.
   * Most operators have exactly one provider record; this creates
   * it on first use rather than requiring a separate onboarding
   * step before an operator can list their first route.
   */
  async findOrCreateProviderForOperator(tenantId: string, operatorId: string, businessName: string) {
    const [existing] = await this.db
      .select()
      .from(schema.transportProviders)
      .where(withTenant(schema.transportProviders.tenantId, tenantId, eq(schema.transportProviders.operatorId, operatorId)))
      .limit(1);
    if (existing) return existing;

    const [created] = await this.db
      .insert(schema.transportProviders)
      .values(scopedInsert(tenantId, { operatorId, name: businessName }))
      .returning();
    return created!;
  }

  async searchRoutes(tenantId: string, filters: { originCityId?: string; destinationCityId?: string }) {
    const conditions = [eq(schema.transportProviders.tenantId, tenantId)];
    if (filters.originCityId) conditions.push(eq(schema.transportRoutes.originCityId, filters.originCityId));
    if (filters.destinationCityId)
      conditions.push(eq(schema.transportRoutes.destinationCityId, filters.destinationCityId));

    const rows = await this.db
      .select({ route: schema.transportRoutes })
      .from(schema.transportRoutes)
      .innerJoin(schema.transportProviders, eq(schema.transportProviders.id, schema.transportRoutes.transportProviderId))
      .where(and(...conditions));
    return rows.map((r) => r.route);
  }

  /**
   * Tenant-scoped via a join to transport_providers - transport_routes
   * itself has no tenant_id column (it's a child of transport_providers,
   * per the Phase 1 schema decision not to duplicate tenant_id onto every
   * child table). This join is what stops reserveTransportTx from
   * reserving a route belonging to a different tenant than the booking.
   */
  async findRouteById(tenantId: string, id: string) {
    const [row] = await this.db
      .select({ route: schema.transportRoutes })
      .from(schema.transportRoutes)
      .innerJoin(schema.transportProviders, eq(schema.transportProviders.id, schema.transportRoutes.transportProviderId))
      .where(and(eq(schema.transportRoutes.id, id), eq(schema.transportProviders.tenantId, tenantId)))
      .limit(1);
    return row?.route ?? null;
  }

  /** transport_routes has no tenant_id column of its own - tenantId is only used to create the provider, not stamped onto the route insert. */
  async createRoute(transportProviderId: string, input: CreateTransportRouteInput) {
    const [row] = await this.db
      .insert(schema.transportRoutes)
      .values({
        transportProviderId,
        originCityId: input.originCityId,
        destinationCityId: input.destinationCityId,
        vehicleTypeId: input.vehicleTypeId,
        basePrice: input.basePrice.toFixed(2),
        currency: input.currency,
        estimatedDurationMinutes: input.estimatedDurationMinutes,
      })
      .returning();
    return row!;
  }

  async findVehiclesForRoute(tenantId: string, routeId: string) {
    const route = await this.findRouteById(tenantId, routeId);
    if (!route) return [];
    return this.db.select().from(schema.vehicles).where(eq(schema.vehicles.vehicleTypeId, route.vehicleTypeId));
  }

  async listVehicleTypes(tenantId: string) {
    return this.db.select().from(schema.vehicleTypes).where(eq(schema.vehicleTypes.tenantId, tenantId));
  }

  /** Section 28 (partner portal: manage vehicles). Scoped to the operator's own transport_providers row, same ownership model as routes. */
  async createVehicle(
    transportProviderId: string,
    input: { vehicleTypeId: string; name?: string; registrationNumber?: string; capacity: number }
  ) {
    const [row] = await this.db.insert(schema.vehicles).values({ transportProviderId, ...input }).returning();
    return row!;
  }

  async listVehiclesForProvider(transportProviderId: string) {
    return this.db
      .select()
      .from(schema.vehicles)
      .where(and(eq(schema.vehicles.transportProviderId, transportProviderId), isNull(schema.vehicles.deletedAt)));
  }

  /** Passengers already booked on a given vehicle for a given date - used to check seat capacity. */
  async getBookedPassengerCount(tx: Database, vehicleId: string, travelDate: string): Promise<number> {
    const result = await tx.execute(sql`
      SELECT COALESCE(SUM(passenger_count), 0)::int AS total
      FROM transport_bookings
      WHERE vehicle_id = ${vehicleId}
        AND travel_date = ${travelDate}
        AND status IN ('held', 'confirmed')
      FOR UPDATE
    `);
    const row = (result as unknown as Array<{ total: number }>)[0];
    return row?.total ?? 0;
  }

  async createBookingTx(
    tx: Database,
    input: {
      bookingId: string | null;
      transportRouteId: string;
      vehicleId: string | null;
      travelDate: string;
      passengerCount: number;
      price: number;
      currency: string;
    }
  ) {
    const [row] = await tx
      .insert(schema.transportBookings)
      .values({
        bookingId: input.bookingId,
        transportRouteId: input.transportRouteId,
        vehicleId: input.vehicleId,
        travelDate: input.travelDate,
        passengerCount: input.passengerCount,
        price: input.price.toFixed(2),
        currency: input.currency,
        status: "held",
      })
      .returning();
    return row!;
  }
}
