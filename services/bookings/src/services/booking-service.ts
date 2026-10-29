import { randomUUID } from "node:crypto";
import { eq, schema, scopedInsert, withTenantRLS, withPlatformRLSBypass, type Database, type PlanLimitChecker } from "@travel/database";
import { AvailabilityError, BookingError, ConflictError, NotFoundError, ValidationError, type BookingStatus, type Currency } from "@travel/types";
import type { CreateBookingInput } from "@travel/validation";
import { AvailabilityRepository, PackageRepository, calculatePackageQuote } from "@travel/service-packages/internal";
import { AccommodationService } from "@travel/service-accommodation/internal";
import { TransportService } from "@travel/service-transport/internal";
import { TransferService } from "@travel/service-transfers/internal";
import { PromotionService } from "@travel/service-promotions/internal";
import { EventPublisher } from "@travel/events";
import type { BookingRepository } from "../repositories/booking-repository.js";
import type { CancellationPolicyRepository } from "../repositories/cancellation-policy-repository.js";
import { computeCancellationAmounts } from "../cancellation-rules.js";
import { transitionBookingStatus } from "../state-machine.js";

const HOLD_DURATION_MINUTES = 15;

/** Adds `days` to an ISO date string (YYYY-MM-DD), returning another ISO date string. */
function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export class BookingService {
  constructor(
    private readonly db: Database,
    private readonly bookings: BookingRepository,
    private readonly packages: PackageRepository,
    private readonly availability: AvailabilityRepository,
    private readonly cancellationPolicies: CancellationPolicyRepository,
    private readonly events: EventPublisher,
    private readonly accommodation: AccommodationService,
    private readonly transport: TransportService,
    private readonly transfers: TransferService,
    private readonly promotions: PromotionService,
    private readonly planLimits: PlanLimitChecker
  ) {}

  /**
   * Creates a booking end-to-end: validates the package/date,
   * computes the authoritative price server-side, reserves
   * inventory (package seats + optional transport/accommodation/
   * transfer line items), and writes everything in ONE
   * transaction so a failure at any step (e.g. sold out, room
   * unavailable) rolls back cleanly.
   *
   * Idempotency: if a booking already exists for this
   * Idempotency-Key, it is returned as-is rather than creating a
   * duplicate - safe to retry from a flaky mobile client.
   */
  async createBooking(tenantId: string, userId: string, idempotencyKey: string, input: CreateBookingInput) {
    const existing = await this.bookings.findByIdempotencyKey(tenantId, idempotencyKey);
    if (existing) {
      return existing;
    }

    // Checked before any inventory is touched, not just before the
    // final insert - no point reserving rooms/seats/a coupon redemption
    // only to reject the booking a moment later over a plan limit.
    await this.planLimits.checkBookingLimit(tenantId);

    const pkg = await this.packages.findById(tenantId, input.packageId);
    if (!pkg) throw new NotFoundError("Package");

    const travelerCounts = { adult: 0, child: 0, infant: 0 } as Record<"adult" | "child" | "infant", number>;
    for (const t of input.travelers) {
      travelerCounts[t.travelerType] += 1;
    }
    const totalTravelers = input.travelers.length;

    if (pkg.maxGroupSize && totalTravelers > pkg.maxGroupSize) {
      throw new ValidationError(`This package allows a maximum of ${pkg.maxGroupSize} travelers`);
    }
    if (totalTravelers < pkg.minGroupSize) {
      throw new ValidationError(`This package requires a minimum of ${pkg.minGroupSize} travelers`);
    }

    // Price is ALWAYS computed here, server-side, from the package's price
    // matrix - never accepted from the client. Optional line items
    // (transport/accommodation/transfer) are added to this below, also
    // priced server-side from their own tables.
    const prices = await this.packages.getPrices(input.packageId);
    const quote = calculatePackageQuote(prices, input.travelDate, travelerCounts);

    const bookingId = await withTenantRLS(this.db, tenantId, async (tx) => {
      // Row-locks the availability row and throws AvailabilityError if oversubscribed.
      await this.availability.reserveSeats(tx, input.packageId, input.travelDate, totalTravelers);

      const holdExpiresAt = new Date(Date.now() + HOLD_DURATION_MINUTES * 60_000);
      let addOnTotal = 0;

      const [booking] = await tx
        .insert(schema.bookings)
        .values(
          scopedInsert(tenantId, {
            userId,
            packageId: input.packageId,
            status: "DRAFT",
            travelDate: input.travelDate,
            travelerCount: totalTravelers,
            subtotalAmount: quote.subtotal.toFixed(2),
            discountAmount: "0.00",
            taxAmount: "0.00",
            totalAmount: quote.subtotal.toFixed(2), // corrected below once add-ons are priced
            currency: quote.currency,
            contactEmail: input.contactEmail,
            contactPhone: input.contactPhone,
            specialRequests: input.specialRequests,
            idempotencyKey,
            holdExpiresAt,
          })
        )
        .returning();
      const bookingId = booking!.id;

      // --- Optional add-on line items, each priced and reserved server-side ---
      // Phase 8 hardening (closed): transportOptionId / accommodationRoomTypeId
      // are validated against package_transport_options / package_accommodation_options
      // BEFORE anything is reserved, so a client can't request a transport route
      // or room type this specific package never actually offered (e.g. a route
      // that belongs to a different, possibly cheaper or unrelated, package).
      if (input.transportOptionId) {
        const offeredOption = await this.packages.findTransportOption(input.packageId, input.transportOptionId);
        if (!offeredOption) {
          throw new ValidationError("The selected transport option is not offered on this package");
        }
        const { price, currency } = await this.transport.reserveTransportTx(tx, tenantId, {
          bookingId,
          transportRouteId: input.transportOptionId,
          travelDate: input.travelDate,
          passengerCount: totalTravelers,
        });
        await tx.insert(schema.bookingItems).values({
          bookingId,
          itemType: "transport",
          referenceId: input.transportOptionId,
          description: "Transport",
          amount: price.toFixed(2),
          currency,
        });
        addOnTotal += price;
      }

      if (input.accommodationRoomTypeId) {
        const offeredOption = await this.packages.findAccommodationOption(
          input.packageId,
          input.accommodationRoomTypeId
        );
        if (!offeredOption) {
          throw new ValidationError("The selected accommodation option is not offered on this package");
        }
        const checkInDate = input.travelDate;
        const checkOutDate = addDays(input.travelDate, pkg.durationDays);
        const { subtotal, currency } = await this.accommodation.reserveRoomsTx(tx, tenantId, {
          bookingId,
          roomTypeId: input.accommodationRoomTypeId,
          checkInDate,
          checkOutDate,
          roomsRequested: Math.max(1, Math.ceil(totalTravelers / 2)), // simple default occupancy of 2/room
        });
        await tx.insert(schema.bookingItems).values({
          bookingId,
          itemType: "accommodation",
          referenceId: input.accommodationRoomTypeId,
          description: `Accommodation (${checkInDate} to ${checkOutDate})`,
          amount: subtotal.toFixed(2),
          currency,
        });
        addOnTotal += subtotal;
      }

      if (input.airportTransferId) {
        const { price, currency } = await this.transfers.reserveTransferTx(tx, tenantId, {
          bookingId,
          airportTransferId: input.airportTransferId,
          transferDate: input.travelDate,
          passengerCount: totalTravelers,
          luggageCount: 0,
          childSeatsRequired: 0,
        });
        await tx.insert(schema.bookingItems).values({
          bookingId,
          itemType: "transfer",
          referenceId: input.airportTransferId,
          description: "Airport transfer",
          amount: price.toFixed(2),
          currency,
        });
        addOnTotal += price;
      }

      let discountAmount = 0;
      let appliedCouponCode: string | null = null;
      if (input.couponCode) {
        const preDiscountTotal = quote.subtotal + addOnTotal;
        // quote.currency is typed as plain `string` by the quote engine (pre-existing,
        // out of scope here) - cast to Currency since it's always one of the seeded values.
        const evaluation = await this.promotions.applyCouponTx(
          tx,
          tenantId,
          input.couponCode,
          preDiscountTotal,
          quote.currency as Currency
        );
        discountAmount = evaluation.discountAmount;
        appliedCouponCode = evaluation.code;
      }

      if (addOnTotal > 0 || discountAmount > 0) {
        const newTotal = Math.max(0, quote.subtotal + addOnTotal - discountAmount);
        await tx
          .update(schema.bookings)
          .set({
            totalAmount: newTotal.toFixed(2),
            discountAmount: discountAmount.toFixed(2),
            couponCode: appliedCouponCode,
            updatedAt: new Date(),
          })
          .where(eq(schema.bookings.id, bookingId));
      }

      await tx.insert(schema.bookingStatusHistory).values({
        bookingId,
        fromStatus: null,
        toStatus: "DRAFT",
        changedByUserId: userId,
        reason: "Booking created",
      });

      // Move DRAFT -> PENDING_PAYMENT immediately: the hold now has a
      // clock on it, and the client proceeds straight to checkout.
      await transitionBookingStatus(tx, bookingId, "PENDING_PAYMENT", {
        changedByUserId: userId,
        reason: "Awaiting payment",
      });

      return bookingId;
    });

    const created = await this.bookings.findById(tenantId, bookingId);

    // Published AFTER the transaction commits - see EventPublisher's
    // doc comment on why this must never happen from inside the tx.
    await this.events.publish("booking.created", {
      bookingId: created!.id,
      tenantId,
      userId: created!.userId,
      contactEmail: created!.contactEmail,
      contactPhone: created!.contactPhone,
      packageId: created!.packageId,
      travelDate: created!.travelDate,
      totalAmount: created!.totalAmount,
      currency: created!.currency,
    });

    return created!;
  }

  async getBookingForUser(tenantId: string, bookingId: string, userId: string) {
    const booking = await this.bookings.findByIdForUser(tenantId, bookingId, userId);
    if (!booking) throw new NotFoundError("Booking");
    const [items, travelers, statusHistory] = await Promise.all([
      this.bookings.getItems(bookingId),
      this.bookings.getTravelers(bookingId),
      this.bookings.getStatusHistory(bookingId),
    ]);
    return { ...booking, items, travelers, statusHistory };
  }

  async listForUser(tenantId: string, userId: string) {
    return this.bookings.listForUser(tenantId, userId);
  }

  async listForOperator(tenantId: string, operatorId: string) {
    return this.bookings.listForOperator(tenantId, operatorId);
  }

  /**
   * Cancellation flow per the brief: resolve rule -> compute
   * refund/penalty -> record cancellation -> release inventory ->
   * transition status. Refund is initiated by the Payment service
   * (called by the route layer / an emitted domain event) - this
   * method only computes amounts and updates booking state.
   */
  async cancelBooking(tenantId: string, bookingId: string, userId: string, reason: string | undefined) {
    const booking = await this.bookings.findByIdForUser(tenantId, bookingId, userId);
    if (!booking) throw new NotFoundError("Booking");
    return this.processCancellation(booking, userId, reason);
  }

  /**
   * Section 44 (admin: cancel bookings) - same cancellation math and
   * refund flow as the customer-facing path above, just without the
   * ownership check `findByIdForUser` enforces. Deliberately reuses
   * `processCancellation` rather than re-implementing the rule
   * lookup/refund computation, so admin and customer cancellations can
   * never silently diverge in behavior. tenantId is null only for a
   * super_admin acting cross-tenant (see routes.ts).
   */
  async adminCancelBooking(tenantId: string | null, bookingId: string, adminUserId: string, reason: string | undefined) {
    const booking = tenantId ? await this.bookings.findById(tenantId, bookingId) : await this.bookings.findByIdUnscoped(bookingId);
    if (!booking) throw new NotFoundError("Booking");
    return this.processCancellation(booking, adminUserId, reason);
  }

  async adminListBookings(tenantId: string | null, page: number, pageSize: number, status?: BookingStatus) {
    return this.bookings.listAll(tenantId, page, pageSize, status);
  }

  async adminGetBooking(tenantId: string | null, bookingId: string) {
    const booking = tenantId ? await this.bookings.findById(tenantId, bookingId) : await this.bookings.findByIdUnscoped(bookingId);
    if (!booking) throw new NotFoundError("Booking");
    const [items, travelers, statusHistory] = await Promise.all([
      this.bookings.getItems(bookingId),
      this.bookings.getTravelers(bookingId),
      this.bookings.getStatusHistory(bookingId),
    ]);
    return { ...booking, items, travelers, statusHistory };
  }

  private async processCancellation(
    booking: NonNullable<Awaited<ReturnType<BookingRepository["findById"]>>>,
    changedByUserId: string,
    reason: string | undefined
  ) {
    const bookingId = booking.id;
    const pkg = await this.packages.findById(booking.tenantId, booking.packageId!);
    if (!pkg) throw new NotFoundError("Package");

    const daysBeforeTrip = Math.floor(
      (new Date(booking.travelDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );

    // A booking nobody has paid for yet (still DRAFT / PENDING_PAYMENT) has
    // nothing to refund and is not in a state the state machine allows to
    // enter CANCEL_REQUESTED. Previously every cancellation went through
    // CANCEL_REQUESTED, so a customer could not cancel an unpaid booking at
    // all (409 Conflict) and had to wait for the hold to expire - and any
    // cancellation policy would have computed a "refund" from the total
    // price even though no money had been collected.
    const isUnpaid = booking.status === "DRAFT" || booking.status === "PENDING_PAYMENT";

    let refundAmount = 0;
    let penaltyAmount = 0;
    let ruleId: string | null = null;

    if (!isUnpaid && pkg.cancellationPolicyId) {
      const rule = await this.cancellationPolicies.findApplicableRule(pkg.cancellationPolicyId, daysBeforeTrip);
      if (rule) {
        ruleId = rule.id;
        const amounts = computeCancellationAmounts(rule, Number(booking.totalAmount));
        refundAmount = amounts.refundAmount;
        penaltyAmount = amounts.penaltyAmount;
      }
    }
    // No policy configured: fail closed with zero refund rather than guessing -
    // an operator must configure a policy for automatic refunds to apply.

    await withTenantRLS(this.db, booking.tenantId, async (tx) => {
      if (!isUnpaid) {
        await transitionBookingStatus(tx, bookingId, "CANCEL_REQUESTED", { changedByUserId, reason });
      }

      await tx.insert(schema.bookingCancellations).values({
        bookingId,
        ruleAppliedId: ruleId,
        daysBeforeTrip,
        refundAmount: refundAmount.toFixed(2),
        penaltyAmount: penaltyAmount.toFixed(2),
        currency: booking.currency,
        requestedByUserId: changedByUserId,
        reason,
      });

      await transitionBookingStatus(tx, bookingId, "CANCELLED", {
        changedByUserId,
        reason: isUnpaid ? (reason ?? "Cancelled before payment") : "Cancellation processed",
      });

      await this.availability.releaseSeats(tx, booking.packageId!, booking.travelDate, booking.travelerCount);

      if (refundAmount > 0) {
        await transitionBookingStatus(tx, bookingId, "REFUND_PENDING", {
          changedByUserId,
          reason: "Refund initiated",
        });
        // Ledger entries for the penalty/refund are posted by the Payment
        // service once it actually issues the provider-side refund -
        // recording them here before the refund succeeds would create a
        // ledger entry for money that hasn't moved yet.
      }
    });

    await this.events.publish("booking.cancelled", {
      tenantId: booking.tenantId,
      bookingId,
      userId: booking.userId,
      contactEmail: booking.contactEmail,
      contactPhone: booking.contactPhone,
      refundAmount: refundAmount.toFixed(2),
      currency: booking.currency,
    });

    return { refundAmount, penaltyAmount, daysBeforeTrip };
  }

  /**
   * Reaper: releases inventory and expires bookings whose payment
   * hold has lapsed. Intended to run on a schedule (e.g. every
   * minute via a worker/cron), not on the request path.
   *
   * Deliberately cross-tenant by design (see BookingRepository.findExpiredHolds'
   * doc comment) - a system job, not acting on any one user's behalf,
   * so it uses withPlatformRLSBypass rather than a per-tenant
   * withTenantRLS, same as the platform's own super_admin endpoints do.
   */
  async releaseExpiredHolds() {
    const expired = await this.bookings.findExpiredHolds(new Date());
    for (const booking of expired) {
      await withPlatformRLSBypass(this.db, async (tx) => {
        await transitionBookingStatus(tx, booking.id, "EXPIRED", { reason: "Payment hold expired" });
        if (booking.packageId) {
          await this.availability.releaseSeats(tx, booking.packageId, booking.travelDate, booking.travelerCount);
        }
      });
    }
    return { released: expired.length };
  }
}
