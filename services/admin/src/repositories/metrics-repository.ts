import { and, eq, gte, inArray, lte, schema, sql, type Column, type Database } from "@travel/database";

export interface DateRange {
  from?: string; // ISO date
  to?: string;
}

function rangeConditions(column: Column, range: DateRange) {
  const conditions = [];
  if (range.from) conditions.push(gte(column, new Date(range.from)));
  if (range.to) conditions.push(lte(column, new Date(range.to)));
  return conditions;
}

/**
 * Every method here takes `tenantId: string | null` - null means a
 * super_admin's cross-tenant aggregate (see routes.ts for how that's
 * resolved), a real id scopes the numbers to one tenant's own dashboard.
 * This matters everywhere in this file: without it, a tenant's admin
 * dashboard would silently show every other tenant's revenue and
 * bookings mixed into their own numbers.
 */
export class MetricsRepository {
  constructor(private readonly db: Database) {}

  async getBookingCounts(tenantId: string | null, range: DateRange) {
    const conditions = [
      tenantId ? eq(schema.bookings.tenantId, tenantId) : undefined,
      ...rangeConditions(schema.bookings.createdAt, range),
    ].filter((c): c is NonNullable<typeof c> => Boolean(c));
    const rows = await this.db
      .select({ status: schema.bookings.status, count: sql<number>`count(*)::int` })
      .from(schema.bookings)
      .where(conditions.length ? and(...conditions) : undefined)
      .groupBy(schema.bookings.status);

    const byStatus: Record<string, number> = {};
    let total = 0;
    for (const row of rows) {
      byStatus[row.status] = row.count;
      total += row.count;
    }
    return { total, byStatus };
  }

  /**
   * Revenue = sum of positive customer_payment ledger entries; refunds
   * are separate negative entries and not netted here so both are
   * visible. ledger_entries has no tenant_id column of its own (child
   * of bookings, per the Phase 1 schema decision) - every query here
   * joins through bookings to scope by tenant.
   */
  async getRevenueSummary(tenantId: string | null, range: DateRange) {
    const tenantJoinCondition = tenantId ? eq(schema.bookings.tenantId, tenantId) : undefined;

    const sumFor = async (entryType: string) => {
      const conditions = [
        eq(schema.ledgerEntries.entryType, entryType as any),
        tenantJoinCondition,
        ...rangeConditions(schema.ledgerEntries.createdAt, range),
      ].filter((c): c is NonNullable<typeof c> => Boolean(c));
      const [row] = await this.db
        .select({ total: sql<string>`COALESCE(SUM(${schema.ledgerEntries.amount}), 0)` })
        .from(schema.ledgerEntries)
        .innerJoin(schema.bookings, eq(schema.bookings.id, schema.ledgerEntries.bookingId))
        .where(and(...conditions));
      return Number(row?.total ?? 0);
    };

    const [grossRevenue, totalRefunds, platformFees] = await Promise.all([
      sumFor("customer_payment"),
      sumFor("refund"),
      sumFor("platform_fee"),
    ]);

    return {
      grossRevenue,
      totalRefunds: Math.abs(totalRefunds),
      platformFees: Math.abs(platformFees),
    };
  }

  async getCustomerCount(tenantId: string | null, range: DateRange) {
    const conditions = [
      tenantId ? eq(schema.users.tenantId, tenantId) : undefined,
      ...rangeConditions(schema.users.createdAt, range),
    ].filter((c): c is NonNullable<typeof c> => Boolean(c));
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.users)
      .where(conditions.length ? and(...conditions) : undefined);
    return row?.count ?? 0;
  }

  async getActiveCounts(tenantId: string | null) {
    const destConditions = [
      eq(schema.destinations.status, "published"),
      tenantId ? eq(schema.destinations.tenantId, tenantId) : undefined,
    ].filter((c): c is NonNullable<typeof c> => Boolean(c));
    const pkgConditions = [
      eq(schema.packages.status, "published"),
      tenantId ? eq(schema.packages.tenantId, tenantId) : undefined,
    ].filter((c): c is NonNullable<typeof c> => Boolean(c));
    const operatorConditions = [
      eq(schema.operators.status, "approved"),
      tenantId ? eq(schema.operators.tenantId, tenantId) : undefined,
    ].filter((c): c is NonNullable<typeof c> => Boolean(c));

    const [[destRow], [pkgRow], [operatorRow]] = await Promise.all([
      this.db.select({ count: sql<number>`count(*)::int` }).from(schema.destinations).where(and(...destConditions)),
      this.db.select({ count: sql<number>`count(*)::int` }).from(schema.packages).where(and(...pkgConditions)),
      this.db.select({ count: sql<number>`count(*)::int` }).from(schema.operators).where(and(...operatorConditions)),
    ]);
    return {
      activeDestinations: destRow?.count ?? 0,
      activePackages: pkgRow?.count ?? 0,
      activeOperators: operatorRow?.count ?? 0,
    };
  }

  async getPopularDestinations(tenantId: string | null, limit = 5) {
    // "Popular" = most bookings via packages that include this destination.
    const conditions = tenantId ? [eq(schema.destinations.tenantId, tenantId)] : [];
    return this.db
      .select({
        destinationId: schema.packageDestinations.destinationId,
        destinationName: schema.destinations.name,
        bookingCount: sql<number>`count(${schema.bookings.id})::int`,
      })
      .from(schema.packageDestinations)
      .innerJoin(schema.destinations, eq(schema.packageDestinations.destinationId, schema.destinations.id))
      .innerJoin(schema.packages, eq(schema.packageDestinations.packageId, schema.packages.id))
      .leftJoin(schema.bookings, eq(schema.bookings.packageId, schema.packages.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .groupBy(schema.packageDestinations.destinationId, schema.destinations.name)
      .orderBy(sql`count(${schema.bookings.id}) DESC`)
      .limit(limit);
  }

  async getUpcomingTripsCount(tenantId: string | null) {
    const conditions = [
      inArray(schema.bookings.status, ["CONFIRMED", "UPCOMING"]),
      gte(schema.bookings.travelDate, new Date().toISOString().slice(0, 10)),
      tenantId ? eq(schema.bookings.tenantId, tenantId) : undefined,
    ].filter((c): c is NonNullable<typeof c> => Boolean(c));
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.bookings)
      .where(and(...conditions));
    return row?.count ?? 0;
  }

  async getPendingOperatorsCount(tenantId: string | null) {
    const conditions = [
      eq(schema.operators.status, "pending"),
      tenantId ? eq(schema.operators.tenantId, tenantId) : undefined,
    ].filter((c): c is NonNullable<typeof c> => Boolean(c));
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.operators)
      .where(and(...conditions));
    return row?.count ?? 0;
  }

  async getCancellationRate(tenantId: string | null, range: DateRange) {
    const baseConditions = [
      tenantId ? eq(schema.bookings.tenantId, tenantId) : undefined,
      ...rangeConditions(schema.bookings.createdAt, range),
    ].filter((c): c is NonNullable<typeof c> => Boolean(c));
    const [totalRow] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.bookings)
      .where(baseConditions.length ? and(...baseConditions) : undefined);
    const [cancelledRow] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.bookings)
      .where(and(inArray(schema.bookings.status, ["CANCELLED", "REFUND_PENDING", "REFUNDED"]), ...baseConditions));
    const total = totalRow?.count ?? 0;
    const cancelled = cancelledRow?.count ?? 0;
    return total === 0 ? 0 : Math.round((cancelled / total) * 1000) / 10; // percentage, 1 decimal
  }

  /**
   * Section 29 (admin dashboard: "Revenue over time" / "Bookings over
   * time" charts). Buckets by day via date_trunc - the dashboard's
   * other metrics are point-in-time aggregates, but a chart needs a
   * series, so this is a distinct query rather than a variant of
   * getRevenueSummary/getBookingCounts.
   */
  async getRevenueTimeSeries(tenantId: string | null, range: DateRange) {
    const conditions = [
      eq(schema.ledgerEntries.entryType, "customer_payment"),
      tenantId ? eq(schema.bookings.tenantId, tenantId) : undefined,
      ...rangeConditions(schema.ledgerEntries.createdAt, range),
    ].filter((c): c is NonNullable<typeof c> => Boolean(c));
    const rows = await this.db
      .select({
        day: sql<string>`date_trunc('day', ${schema.ledgerEntries.createdAt})::date`,
        total: sql<string>`COALESCE(SUM(${schema.ledgerEntries.amount}), 0)`,
      })
      .from(schema.ledgerEntries)
      .innerJoin(schema.bookings, eq(schema.bookings.id, schema.ledgerEntries.bookingId))
      .where(and(...conditions))
      .groupBy(sql`date_trunc('day', ${schema.ledgerEntries.createdAt})`)
      .orderBy(sql`date_trunc('day', ${schema.ledgerEntries.createdAt})`);
    return rows.map((r) => ({ date: r.day, amount: Number(r.total) }));
  }

  async getBookingsTimeSeries(tenantId: string | null, range: DateRange) {
    const conditions = [
      tenantId ? eq(schema.bookings.tenantId, tenantId) : undefined,
      ...rangeConditions(schema.bookings.createdAt, range),
    ].filter((c): c is NonNullable<typeof c> => Boolean(c));
    const rows = await this.db
      .select({
        day: sql<string>`date_trunc('day', ${schema.bookings.createdAt})::date`,
        count: sql<number>`count(*)::int`,
      })
      .from(schema.bookings)
      .where(conditions.length ? and(...conditions) : undefined)
      .groupBy(sql`date_trunc('day', ${schema.bookings.createdAt})`)
      .orderBy(sql`date_trunc('day', ${schema.bookings.createdAt})`);
    return rows.map((r) => ({ date: r.day, count: r.count }));
  }
}
