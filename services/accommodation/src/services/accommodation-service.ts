import { AvailabilityError, NotFoundError, ValidationError } from "@travel/types";
import type { Database } from "@travel/database";
import type { AccommodationSearchQuery, BookRoomInput, CreateAccommodationInput, CreateRoomTypeInput } from "@travel/validation";
import type { AccommodationRepository } from "../repositories/accommodation-repository.js";

function nightsBetween(checkIn: string, checkOut: string): number {
  const nights = (new Date(checkOut).getTime() - new Date(checkIn).getTime()) / (1000 * 60 * 60 * 24);
  return Math.round(nights);
}

export class AccommodationService {
  constructor(private readonly db: Database, private readonly repo: AccommodationRepository) {}

  async search(tenantId: string, query: AccommodationSearchQuery) {
    const { items, total } = await this.repo.search(tenantId, query);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async getById(tenantId: string, id: string) {
    const row = await this.repo.findById(tenantId, id);
    if (!row) throw new NotFoundError("Accommodation");
    return row;
  }

  async create(tenantId: string, operatorId: string, input: CreateAccommodationInput) {
    return this.repo.create(tenantId, operatorId, input);
  }

  async listForOperator(tenantId: string, operatorId: string) {
    return this.repo.listForOperator(tenantId, operatorId);
  }

  async addRoomType(tenantId: string, accommodationId: string, input: CreateRoomTypeInput) {
    const accommodation = await this.repo.findById(tenantId, accommodationId);
    if (!accommodation) throw new NotFoundError("Accommodation");
    return this.repo.addRoomType(accommodationId, input);
  }

  /** Read-only check exposed for the frontend to show "N rooms left" before checkout. */
  async checkAvailability(tenantId: string, roomTypeId: string, checkIn: string, checkOut: string, roomsRequested: number) {
    const roomType = await this.repo.findRoomType(tenantId, roomTypeId);
    if (!roomType) throw new NotFoundError("Room type");
    if (nightsBetween(checkIn, checkOut) < 1) {
      throw new ValidationError("checkOutDate must be after checkInDate");
    }
    const [totalRooms, bookedRooms] = await Promise.all([
      this.repo.countRoomsOfType(roomTypeId),
      this.repo.getOverlappingBookedRooms(this.db, roomTypeId, checkIn, checkOut),
    ]);
    const available = Math.max(0, totalRooms - bookedRooms);
    return { totalRooms, bookedRooms, available, canFulfill: available >= roomsRequested };
  }

  /**
   * Reserves `roomsRequested` rooms of a type for a date range,
   * inside the CALLER's transaction (typically the Booking
   * service's checkout transaction) so a failure here rolls back
   * the whole booking rather than leaving an orphaned room hold.
   *
   * `tenantId` here - resolved from the booking's own tenant, not
   * from the room type itself - is what stops a Tenant A booking
   * from reserving a Tenant B room type via findRoomType's join.
   */
  async reserveRoomsTx(
    tx: Database,
    tenantId: string,
    input: BookRoomInput & { bookingId: string | null }
  ): Promise<{ nights: number; pricePerNight: number; subtotal: number; currency: string }> {
    const roomType = await this.repo.findRoomType(tenantId, input.roomTypeId);
    if (!roomType) throw new NotFoundError("Room type");

    const nights = nightsBetween(input.checkInDate, input.checkOutDate);
    if (nights < 1) throw new ValidationError("checkOutDate must be after checkInDate");

    const totalRooms = await this.repo.countRoomsOfType(input.roomTypeId);
    const bookedRooms = await this.repo.getOverlappingBookedRooms(tx, input.roomTypeId, input.checkInDate, input.checkOutDate);
    const available = totalRooms - bookedRooms;

    if (available < input.roomsRequested) {
      throw new AvailabilityError(
        `Only ${Math.max(0, available)} room(s) of this type available for the selected dates`
      );
    }

    const pricePerNight = Number(roomType.basePricePerNight);
    await this.repo.createAccommodationBookingTx(tx, {
      roomTypeId: input.roomTypeId,
      bookingId: input.bookingId,
      checkInDate: input.checkInDate,
      checkOutDate: input.checkOutDate,
      roomsBooked: input.roomsRequested,
      pricePerNight,
      currency: roomType.currency,
    });

    const subtotal = Math.round(pricePerNight * nights * input.roomsRequested * 100) / 100;
    return { nights, pricePerNight, subtotal, currency: roomType.currency };
  }
}
