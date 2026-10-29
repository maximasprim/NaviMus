import { NotFoundError, ValidationError } from "@travel/types";
import type { Database } from "@travel/database";
import type { BookAirportTransferInput, CreateAirportTransferInput, CreateTransferLocationInput } from "@travel/validation";
import type { TransferRepository } from "../repositories/transfer-repository.js";

export class TransferService {
  constructor(private readonly repo: TransferRepository) {}

  async createLocation(tenantId: string, input: CreateTransferLocationInput) {
    return this.repo.createLocation(tenantId, input);
  }

  async searchLocations(tenantId: string, cityId?: string) {
    return this.repo.searchLocations(tenantId, cityId);
  }

  async searchTransfers(tenantId: string, filters: { pickupLocationId?: string; dropoffLocationId?: string }) {
    return this.repo.searchTransfers(tenantId, filters);
  }

  async getTransfer(tenantId: string, id: string) {
    const transfer = await this.repo.findTransferById(tenantId, id);
    if (!transfer) throw new NotFoundError("Airport transfer");
    return transfer;
  }

  async createTransfer(tenantId: string, input: CreateAirportTransferInput) {
    if (input.pickupLocationId === input.dropoffLocationId) {
      throw new ValidationError("Pickup and dropoff locations must be different");
    }
    return this.repo.createTransfer(tenantId, input);
  }

  /**
   * Reserves an airport transfer inside the caller's transaction.
   * Transfers are typically private-vehicle bookings without a
   * hard capacity ceiling the way rooms/seats have, so this
   * records the booking and returns pricing rather than checking
   * against a pooled inventory count - operators assign a driver
   * afterward via the admin/partner portal.
   *
   * `tenantId` is the booking's own tenant - findTransferById's
   * tenant filter is what stops this from reserving another
   * tenant's transfer.
   */
  async reserveTransferTx(
    tx: Database,
    tenantId: string,
    input: BookAirportTransferInput & { bookingId: string | null }
  ): Promise<{ price: number; currency: string }> {
    const transfer = await this.repo.findTransferById(tenantId, input.airportTransferId);
    if (!transfer) throw new NotFoundError("Airport transfer");

    const price = Number(transfer.basePrice);
    await this.repo.createBookingTx(tx, {
      bookingId: input.bookingId,
      airportTransferId: input.airportTransferId,
      transferDate: input.transferDate,
      transferTime: input.transferTime,
      passengerCount: input.passengerCount,
      luggageCount: input.luggageCount,
      childSeatsRequired: input.childSeatsRequired,
      flightNumber: input.flightNumber,
      price,
      currency: transfer.currency,
    });

    return { price, currency: transfer.currency };
  }
}
