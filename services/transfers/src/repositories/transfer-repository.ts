import { and, eq, schema, withTenant, scopedInsert, type Database } from "@travel/database";
import type { CreateAirportTransferInput, CreateTransferLocationInput } from "@travel/validation";

export class TransferRepository {
  constructor(private readonly db: Database) {}

  async createLocation(tenantId: string, input: CreateTransferLocationInput) {
    const [row] = await this.db
      .insert(schema.transferLocations)
      .values(scopedInsert(tenantId, { cityId: input.cityId, name: input.name, type: input.type, address: input.address }))
      .returning();
    return row!;
  }

  async searchLocations(tenantId: string, cityId?: string) {
    const conditions = [eq(schema.transferLocations.tenantId, tenantId)];
    if (cityId) conditions.push(eq(schema.transferLocations.cityId, cityId));
    return this.db.select().from(schema.transferLocations).where(and(...conditions));
  }

  /** Tenant-scoped - what stops reserveTransferTx from booking another tenant's transfer. */
  async findTransferById(tenantId: string, id: string) {
    const [row] = await this.db
      .select()
      .from(schema.airportTransfers)
      .where(withTenant(schema.airportTransfers.tenantId, tenantId, eq(schema.airportTransfers.id, id)))
      .limit(1);
    return row ?? null;
  }

  async searchTransfers(tenantId: string, filters: { pickupLocationId?: string; dropoffLocationId?: string }) {
    const conditions = [eq(schema.airportTransfers.tenantId, tenantId)];
    if (filters.pickupLocationId) conditions.push(eq(schema.airportTransfers.pickupLocationId, filters.pickupLocationId));
    if (filters.dropoffLocationId) conditions.push(eq(schema.airportTransfers.dropoffLocationId, filters.dropoffLocationId));
    return this.db.select().from(schema.airportTransfers).where(and(...conditions));
  }

  async createTransfer(tenantId: string, input: CreateAirportTransferInput) {
    const [row] = await this.db
      .insert(schema.airportTransfers)
      .values(
        scopedInsert(tenantId, {
          pickupLocationId: input.pickupLocationId,
          dropoffLocationId: input.dropoffLocationId,
          transferType: input.transferType,
          direction: input.direction,
          basePrice: input.basePrice.toFixed(2),
          currency: input.currency,
          meetAndGreet: input.meetAndGreet,
        })
      )
      .returning();
    return row!;
  }

  async createBookingTx(
    tx: Database,
    input: {
      bookingId: string | null;
      airportTransferId: string;
      transferDate: string;
      transferTime?: string;
      passengerCount: number;
      luggageCount?: number;
      childSeatsRequired?: number;
      flightNumber?: string;
      price: number;
      currency: string;
    }
  ) {
    const [row] = await tx
      .insert(schema.transferBookings)
      .values({
        bookingId: input.bookingId,
        airportTransferId: input.airportTransferId,
        transferDate: input.transferDate,
        transferTime: input.transferTime,
        passengerCount: input.passengerCount,
        luggageCount: input.luggageCount ?? 0,
        childSeatsRequired: input.childSeatsRequired ?? 0,
        flightNumber: input.flightNumber,
        price: input.price.toFixed(2),
        currency: input.currency,
        status: "held",
      })
      .returning();
    return row!;
  }
}
