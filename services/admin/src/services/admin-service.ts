import { NotFoundError } from "@travel/types";
import type { CreateCancellationPolicyInput } from "@travel/validation";
import type { DateRange, MetricsRepository } from "../repositories/metrics-repository.js";
import type { AdminOperationsRepository } from "../repositories/admin-operations-repository.js";

/**
 * `tenantId: string | null` runs through almost every method here: null
 * means a super_admin's cross-tenant view (see routes.ts for how that's
 * resolved from the caller's roles), a real id scopes to one tenant's own
 * admin dashboard/settings/audit trail. Reference-data methods (countries,
 * regions, cities) are the one exception - that's shared platform-wide
 * geography, not tenant data, per the Phase 1 schema decision.
 */
export class AdminService {
  constructor(
    private readonly metrics: MetricsRepository,
    private readonly ops: AdminOperationsRepository
  ) {}

  /**
   * Single aggregate call backing the admin dashboard's summary
   * cards. Each metric is its own repository query rather than one
   * giant SQL statement - easier to reason about and cache
   * individually later, at the cost of a few more round trips,
   * which is the right trade for an internal dashboard endpoint.
   */
  async getDashboardMetrics(tenantId: string | null, range: DateRange) {
    const [bookingCounts, revenue, customerCount, activeCounts, popularDestinations, upcomingTrips, pendingOperators, cancellationRate] =
      await Promise.all([
        this.metrics.getBookingCounts(tenantId, range),
        this.metrics.getRevenueSummary(tenantId, range),
        this.metrics.getCustomerCount(tenantId, range),
        this.metrics.getActiveCounts(tenantId),
        this.metrics.getPopularDestinations(tenantId, 5),
        this.metrics.getUpcomingTripsCount(tenantId),
        this.metrics.getPendingOperatorsCount(tenantId),
        this.metrics.getCancellationRate(tenantId, range),
      ]);

    return {
      bookings: bookingCounts,
      revenue,
      customers: { newInRange: customerCount },
      ...activeCounts,
      popularDestinations,
      upcomingTrips,
      pendingOperators,
      cancellationRatePercent: cancellationRate,
    };
  }

  /** Section 29: Revenue-over-time / Bookings-over-time chart data, fetched separately from the dashboard summary since it's a series, not a point-in-time figure. */
  async getDashboardTimeSeries(tenantId: string | null, range: DateRange) {
    const [revenue, bookings] = await Promise.all([
      this.metrics.getRevenueTimeSeries(tenantId, range),
      this.metrics.getBookingsTimeSeries(tenantId, range),
    ]);
    return { revenue, bookings };
  }

  async approveDestination(tenantId: string, id: string, decision: "published" | "rejected", actorUserId: string, reason?: string) {
    const row = await this.ops.setDestinationStatus(tenantId, id, decision);
    if (!row) throw new NotFoundError("Destination");
    await this.ops.writeAuditLog({
      tenantId,
      actorUserId,
      action: `destination.${decision}`,
      resourceType: "destination",
      resourceId: id,
      metadata: reason ? { reason } : undefined,
    });
    return row;
  }

  async approvePackage(tenantId: string, id: string, decision: "published" | "rejected", actorUserId: string, reason?: string) {
    const row = await this.ops.setPackageStatus(tenantId, id, decision);
    if (!row) throw new NotFoundError("Package");
    await this.ops.writeAuditLog({
      tenantId,
      actorUserId,
      action: `package.${decision}`,
      resourceType: "package",
      resourceId: id,
      metadata: reason ? { reason } : undefined,
    });
    return row;
  }

  async moderateReview(tenantId: string, id: string, status: "published" | "removed", actorUserId: string) {
    const row = await this.ops.moderateReview(tenantId, id, status);
    if (!row) throw new NotFoundError("Review");
    await this.ops.writeAuditLog({
      tenantId,
      actorUserId,
      action: `review.moderate.${status}`,
      resourceType: "review",
      resourceId: id,
    });
    return row;
  }

  /** tenantId null updates the platform-wide default (super_admin only - enforced at the route layer). */
  async updateSetting(tenantId: string | null, key: string, value: unknown, actorUserId: string, description?: string) {
    const row = await this.ops.upsertSystemSetting(tenantId, key, value, description);
    await this.ops.writeAuditLog({
      tenantId,
      actorUserId,
      action: "system_setting.update",
      resourceType: "system_setting",
      resourceId: row.id,
      metadata: { key, value },
    });
    return row;
  }

  async listSettings(tenantId: string | null) {
    return this.ops.listSystemSettings(tenantId);
  }

  async createCancellationPolicy(tenantId: string, input: CreateCancellationPolicyInput, actorUserId: string) {
    const policy = await this.ops.createCancellationPolicy(tenantId, input);
    await this.ops.writeAuditLog({
      tenantId,
      actorUserId,
      action: "cancellation_policy.create",
      resourceType: "cancellation_policy",
      resourceId: policy.id,
      metadata: { operatorId: input.operatorId },
    });
    return policy;
  }

  async listAuditLogs(tenantId: string | null, page: number, pageSize: number) {
    return this.ops.listAuditLogs(tenantId, page, pageSize);
  }

  /** Backs the admin approval queue UI - without this, the existing approve/reject endpoints have nothing to point at. */
  async listPendingApprovals(tenantId: string) {
    const [destinations, packages] = await Promise.all([
      this.ops.listPendingDestinations(tenantId),
      this.ops.listPendingPackages(tenantId),
    ]);
    return { destinations, packages };
  }

  async listCancellationPolicies(tenantId: string) {
    const policies = await this.ops.listCancellationPolicies(tenantId);
    return Promise.all(policies.map(async (p) => ({ ...p, rules: await this.ops.getCancellationPolicyRules(p.id) })));
  }

  // --- Reference data (spec section 44) - shared platform-wide geography, intentionally not tenant-scoped ---
  async listCountries() {
    return this.ops.listCountries();
  }
  async createCountry(input: { isoCode: string; name: string }) {
    return this.ops.createCountry({ ...input, isoCode: input.isoCode.toUpperCase() });
  }
  async listRegions(countryId?: string) {
    return this.ops.listRegions(countryId);
  }
  async createRegion(input: { countryId: string; name: string }) {
    return this.ops.createRegion(input);
  }
  async listCities(regionId?: string) {
    return this.ops.listCities(regionId);
  }
  async createCity(input: { regionId: string; name: string; latitude?: number; longitude?: number }) {
    return this.ops.createCity(input);
  }

  async listDestinationCategories(tenantId: string) {
    return this.ops.listDestinationCategories(tenantId);
  }
  async createDestinationCategory(tenantId: string, input: { name: string; slug: string; parentId?: string; description?: string }) {
    return this.ops.createDestinationCategory(tenantId, input);
  }
  async listTransferLocations(tenantId: string, cityId?: string) {
    return this.ops.listTransferLocations(tenantId, cityId);
  }
  async createTransferLocation(tenantId: string, input: { cityId: string; name: string; type?: string; address?: string }) {
    return this.ops.createTransferLocation(tenantId, input);
  }

  // --- Notification templates ---
  async listNotificationTemplates(tenantId: string) {
    return this.ops.listNotificationTemplates(tenantId);
  }
  async upsertNotificationTemplate(tenantId: string, input: { key: string; channel: string; locale?: string; subject?: string; bodyTemplate: string }) {
    return this.ops.upsertNotificationTemplate(tenantId, input);
  }
}
