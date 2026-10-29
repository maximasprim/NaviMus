import { AvailabilityError, NotFoundError } from "@travel/types";
import type { Database } from "@travel/database";
import type { BookTransportInput, CreateTransportRouteInput } from "@travel/validation";
import type { TransportRepository } from "../repositories/transport-repository.js";

export class TransportService {
  constructor(private readonly repo: TransportRepository) {}

  async searchRoutes(tenantId: string, filters: { originCityId?: string; destinationCityId?: string }) {
    return this.repo.searchRoutes(tenantId, filters);
  }

  async getRoute(tenantId: string, id: string) {
    const route = await this.repo.findRouteById(tenantId, id);
    if (!route) throw new NotFoundError("Transport route");
    const vehicles = await this.repo.findVehiclesForRoute(tenantId, id);
    return { ...route, vehicles };
  }

  async createRoute(tenantId: string, operatorId: string, operatorBusinessName: string, input: CreateTransportRouteInput) {
    const provider = await this.repo.findOrCreateProviderForOperator(tenantId, operatorId, operatorBusinessName);
    return this.repo.createRoute(provider.id, input);
  }

  async listVehicleTypes(tenantId: string) {
    return this.repo.listVehicleTypes(tenantId);
  }

  async addVehicle(
    tenantId: string,
    operatorId: string,
    operatorBusinessName: string,
    input: { vehicleTypeId: string; name?: string; registrationNumber?: string; capacity: number }
  ) {
    const provider = await this.repo.findOrCreateProviderForOperator(tenantId, operatorId, operatorBusinessName);
    return this.repo.createVehicle(provider.id, input);
  }

  async listMyVehicles(tenantId: string, operatorId: string, operatorBusinessName: string) {
    const provider = await this.repo.findOrCreateProviderForOperator(tenantId, operatorId, operatorBusinessName);
    return this.repo.listVehiclesForProvider(provider.id);
  }

  /**
   * Reserves seats on a transport route for a date, inside the
   * caller's transaction. If a specific vehicle is requested, its
   * per-vehicle capacity is checked; otherwise this reserves
   * against the route generically (capacity enforcement then
   * happens at vehicle-assignment time by an operator).
   *
   * `tenantId` is the booking's own tenant - findRouteById's tenant
   * filter is what stops this from reserving another tenant's route.
   */
  async reserveTransportTx(
    tx: Database,
    tenantId: string,
    input: BookTransportInput & { bookingId: string | null }
  ): Promise<{ price: number; currency: string }> {
    const route = await this.repo.findRouteById(tenantId, input.transportRouteId);
    if (!route) throw new NotFoundError("Transport route");

    if (input.vehicleId) {
      const vehicles = await this.repo.findVehiclesForRoute(tenantId, input.transportRouteId);
      const vehicle = vehicles.find((v) => v.id === input.vehicleId);
      if (!vehicle) throw new NotFoundError("Vehicle");

      const alreadyBooked = await this.repo.getBookedPassengerCount(tx, vehicle.id, input.travelDate);
      if (alreadyBooked + input.passengerCount > vehicle.capacity) {
        throw new AvailabilityError(
          `Only ${Math.max(0, vehicle.capacity - alreadyBooked)} seat(s) remaining on this vehicle for this date`
        );
      }
    }

    const price = Number(route.basePrice);
    await this.repo.createBookingTx(tx, {
      bookingId: input.bookingId,
      transportRouteId: input.transportRouteId,
      vehicleId: input.vehicleId ?? null,
      travelDate: input.travelDate,
      passengerCount: input.passengerCount,
      price,
      currency: route.currency,
    });

    return { price, currency: route.currency };
  }
}
