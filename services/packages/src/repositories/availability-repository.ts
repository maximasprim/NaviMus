import { and, eq, schema, sql, type Database } from "@travel/database";
import { AvailabilityError, NotFoundError } from "@travel/types";

/**
 * All capacity mutations go through here, and ALWAYS inside a
 * transaction with `SELECT ... FOR UPDATE` on the target row.
 * This is what prevents two concurrent checkouts from both
 * reading bookedCount=9/10 and both succeeding - the second
 * transaction blocks on the row lock until the first commits,
 * then re-reads the now-updated count.
 */
export class AvailabilityRepository {
  constructor(private readonly db: Database) {}

  /**
   * Attempts to reserve `count` seats for a package on a date.
   * Must be called within an existing transaction (`tx`) that
   * also creates the booking row, so a failure anywhere rolls
   * back the reservation too.
   */
  async reserveSeats(
    tx: Database,
    packageId: string,
    travelDate: string,
    count: number
  ): Promise<void> {
    const result = await tx.execute(sql`
      SELECT id, total_capacity, booked_count, status
      FROM package_availability
      WHERE package_id = ${packageId} AND travel_date = ${travelDate}
      FOR UPDATE
    `);
    const row = (result as unknown as Array<{
      id: string;
      total_capacity: number;
      booked_count: number;
      status: string;
    }>)[0];
    if (!row) {
      throw new NotFoundError("Availability for the selected travel date");
    }
    if (row.status !== "open") {
      throw new AvailabilityError("This travel date is closed for booking");
    }
    const remaining = row.total_capacity - row.booked_count;
    if (remaining < count) {
      throw new AvailabilityError(
        `Only ${remaining} spot(s) remaining for this date - requested ${count}`
      );
    }

    const newBookedCount = row.booked_count + count;
    const newStatus = newBookedCount >= row.total_capacity ? "sold_out" : "open";

    await tx
      .update(schema.packageAvailability)
      .set({ bookedCount: newBookedCount, status: newStatus, updatedAt: new Date() })
      .where(eq(schema.packageAvailability.id, row.id));
  }

  /** Releases previously reserved seats - used on cancellation, hold expiry, or payment failure. */
  async releaseSeats(tx: Database, packageId: string, travelDate: string, count: number): Promise<void> {
    const result = await tx.execute(sql`
      SELECT id, booked_count, total_capacity
      FROM package_availability
      WHERE package_id = ${packageId} AND travel_date = ${travelDate}
      FOR UPDATE
    `);
    const row = (result as unknown as Array<{ id: string; booked_count: number; total_capacity: number }>)[0];
    if (!row) return; // nothing to release

    const newBookedCount = Math.max(0, row.booked_count - count);
    const newStatus = newBookedCount < row.total_capacity ? "open" : "sold_out";

    await tx
      .update(schema.packageAvailability)
      .set({ bookedCount: newBookedCount, status: newStatus, updatedAt: new Date() })
      .where(eq(schema.packageAvailability.id, row.id));
  }
}
