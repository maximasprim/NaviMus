import { BOOKING_STATUS_TRANSITIONS, ConflictError, type BookingStatus } from "@travel/types";
import { eq, schema, type Database } from "@travel/database";

/**
 * Pure decision function, factored out so it can be unit tested
 * without a database - see state-machine.test.ts. This is the
 * actual rule; transitionBookingStatus below is just this rule
 * plus the two DB writes that must happen alongside it.
 */
export function isTransitionAllowed(fromStatus: BookingStatus, toStatus: BookingStatus): boolean {
  const allowed = BOOKING_STATUS_TRANSITIONS[fromStatus] ?? [];
  return allowed.includes(toStatus);
}

/**
 * The ONLY function in the codebase allowed to change
 * bookings.status. It validates the transition against the
 * allow-list in @travel/types, writes the new status AND a
 * matching booking_status_history row in the same transaction,
 * and throws ConflictError on any disallowed transition rather
 * than silently overwriting state.
 *
 * NOTE ON TYPES: `tx` is typed as `Database` for simplicity here;
 * it is actually whatever `db.transaction(async (tx) => ...)`
 * hands back, which is structurally compatible (same query-builder
 * surface) but not literally the same TS type as the top-level
 * `Database`. Run `pnpm typecheck` after `pnpm install` - if
 * Drizzle's generated transaction type needs a distinct signature,
 * narrow this to `Database | PgTransaction<...>` at that point.
 */
export async function transitionBookingStatus(
  tx: Database,
  bookingId: string,
  toStatus: BookingStatus,
  opts: { changedByUserId?: string; reason?: string; metadata?: Record<string, unknown> } = {}
): Promise<void> {
  const [booking] = await tx
    .select({ status: schema.bookings.status })
    .from(schema.bookings)
    .where(eq(schema.bookings.id, bookingId))
    .limit(1);

  if (!booking) {
    throw new ConflictError(`Booking ${bookingId} not found for status transition`);
  }

  const fromStatus = booking.status as BookingStatus;
  if (!isTransitionAllowed(fromStatus, toStatus)) {
    throw new ConflictError(`Cannot transition booking from ${fromStatus} to ${toStatus}`);
  }

  await tx
    .update(schema.bookings)
    .set({
      status: toStatus,
      updatedAt: new Date(),
      ...(toStatus === "CONFIRMED" ? { confirmedAt: new Date() } : {}),
    })
    .where(eq(schema.bookings.id, bookingId));

  await tx.insert(schema.bookingStatusHistory).values({
    bookingId,
    fromStatus,
    toStatus,
    changedByUserId: opts.changedByUserId,
    reason: opts.reason,
    metadata: opts.metadata,
  });
}
