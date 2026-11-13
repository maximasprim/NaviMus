import { and, desc, eq, ilike, isNull, schema, sql, withTenant, scopedInsert, type Database } from "@travel/database";
import type { CreateCancellationPolicyInput, ListingKind, UpdateListingInput } from "@travel/validation";

export class AdminOperationsRepository {
  constructor(private readonly db: Database) {}

  async setDestinationStatus(tenantId: string, id: string, status: "published" | "rejected") {
    const [row] = await this.db
      .update(schema.destinations)
      .set({ status, publishedAt: status === "published" ? new Date() : undefined, updatedAt: new Date() })
      .where(withTenant(schema.destinations.tenantId, tenantId, eq(schema.destinations.id, id)))
      .returning();
    return row ?? null;
  }

  async setPackageStatus(tenantId: string, id: string, status: "published" | "rejected") {
    const [row] = await this.db
      .update(schema.packages)
      .set({ status, publishedAt: status === "published" ? new Date() : undefined, updatedAt: new Date() })
      .where(withTenant(schema.packages.tenantId, tenantId, eq(schema.packages.id, id)))
      .returning();
    return row ?? null;
  }

  async moderateReview(tenantId: string, id: string, status: "published" | "removed") {
    const [row] = await this.db
      .update(schema.reviews)
      .set({ status, updatedAt: new Date() })
      .where(withTenant(schema.reviews.tenantId, tenantId, eq(schema.reviews.id, id)))
      .returning();
    return row ?? null;
  }

  /**
   * tenantId is nullable here on purpose - see the system_settings schema
   * comment (Phase 1): a null-tenant row is the platform-wide default
   * (set by you, the super_admin), a real tenantId is that tenant's own
   * override of the same key. Two partial unique indexes back this, so
   * there's exactly one row per key per tenant (or per key platform-wide).
   */
  async upsertSystemSetting(tenantId: string | null, key: string, value: unknown, description?: string) {
    const tenantCondition = tenantId ? eq(schema.systemSettings.tenantId, tenantId) : isNull(schema.systemSettings.tenantId);
    const existing = await this.db
      .select()
      .from(schema.systemSettings)
      .where(and(tenantCondition, eq(schema.systemSettings.key, key)))
      .limit(1);

    if (existing.length > 0) {
      const [row] = await this.db
        .update(schema.systemSettings)
        .set({ value: value as any, description, updatedAt: new Date() })
        .where(and(tenantCondition, eq(schema.systemSettings.key, key)))
        .returning();
      return row!;
    }
    const [row] = await this.db
      .insert(schema.systemSettings)
      .values({ tenantId: tenantId ?? undefined, key, value: value as any, description })
      .returning();
    return row!;
  }

  /** tenantId null lists platform-wide defaults; a real id lists that tenant's own overrides. */
  async listSystemSettings(tenantId: string | null) {
    const tenantCondition = tenantId ? eq(schema.systemSettings.tenantId, tenantId) : isNull(schema.systemSettings.tenantId);
    return this.db.select().from(schema.systemSettings).where(tenantCondition);
  }

  async createCancellationPolicy(tenantId: string, input: CreateCancellationPolicyInput) {
    return this.db.transaction(async (tx) => {
      const [policy] = await tx
        .insert(schema.cancellationPolicies)
        .values(scopedInsert(tenantId, { operatorId: input.operatorId, name: input.name }))
        .returning();

      await tx.insert(schema.cancellationRules).values(
        input.rules.map((r) => ({
          policyId: policy!.id,
          daysBeforeMin: r.daysBeforeMin,
          daysBeforeMax: r.daysBeforeMax,
          refundPercentage: r.refundPercentage.toFixed(2),
          penaltyPercentage: r.penaltyPercentage.toFixed(2),
        }))
      );

      return policy!;
    });
  }

  /**
   * tenantId is nullable - a super_admin action that isn't itself scoped
   * to one tenant (e.g. "created tenant X") writes a null-tenant row here.
   * See audit_logs' schema comment (Phase 1) for why forcing a tenantId
   * on every row would make the trail actively misleading rather than
   * just incomplete.
   */
  async writeAuditLog(input: {
    tenantId: string | null;
    actorUserId: string;
    action: string;
    resourceType: string;
    resourceId?: string;
    metadata?: Record<string, unknown>;
  }) {
    await this.db.insert(schema.auditLogs).values({
      tenantId: input.tenantId ?? undefined,
      actorUserId: input.actorUserId,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      metadata: input.metadata,
    });
  }

  /**
   * Section 44 (admin: view audit logs). tenantId null is a super_admin's
   * platform-wide view (every tenant's entries plus platform-level ones);
   * a real id restricts to just that tenant's own audit trail.
   */
  async listAuditLogs(tenantId: string | null, page: number, pageSize: number) {
    const offset = (page - 1) * pageSize;
    const condition = tenantId ? eq(schema.auditLogs.tenantId, tenantId) : undefined;
    const [items, countRows] = await Promise.all([
      this.db
        .select()
        .from(schema.auditLogs)
        .where(condition)
        .orderBy(desc(schema.auditLogs.createdAt))
        .limit(pageSize)
        .offset(offset),
      this.db.select({ count: sql<number>`count(*)::int` }).from(schema.auditLogs).where(condition),
    ]);
    return { items, total: countRows[0]?.count ?? 0 };
  }

  /** Section 44 (admin: approve/reject destinations) - the queue the approve endpoint above needs to actually be usable. */
  async listPendingDestinations(tenantId: string) {
    return this.db
      .select()
      .from(schema.destinations)
      .where(withTenant(schema.destinations.tenantId, tenantId, eq(schema.destinations.status, "pending_review")));
  }

  async listPendingPackages(tenantId: string) {
    return this.db
      .select()
      .from(schema.packages)
      .where(withTenant(schema.packages.tenantId, tenantId, eq(schema.packages.status, "pending_review")));
  }

  async listCancellationPolicies(tenantId: string) {
    return this.db.select().from(schema.cancellationPolicies).where(eq(schema.cancellationPolicies.tenantId, tenantId));
  }

  /** Callers must confirm the policy belongs to their tenant via listCancellationPolicies/findById first - cancellation_rules is a plain child of the policy with no tenant column of its own. */
  async getCancellationPolicyRules(policyId: string) {
    return this.db.select().from(schema.cancellationRules).where(eq(schema.cancellationRules.policyId, policyId));
  }

  // --- Reference data (spec section 44: manage categories/countries/airports) ---
  // Geography (countries/regions/cities) is shared platform-wide reference
  // data, not tenant-scoped - every tenant operates in the same real-world
  // places, per the Phase 1 schema decision. Intentionally no tenantId here.
  async listCountries() {
    return this.db.select().from(schema.countries).orderBy(schema.countries.name);
  }

  async createCountry(input: { isoCode: string; name: string }) {
    const [row] = await this.db.insert(schema.countries).values(input).returning();
    return row!;
  }

  async listRegions(countryId?: string) {
    const query = this.db.select().from(schema.regions);
    return countryId ? query.where(eq(schema.regions.countryId, countryId)) : query;
  }

  async createRegion(input: { countryId: string; name: string }) {
    const [row] = await this.db.insert(schema.regions).values(input).returning();
    return row!;
  }

  async listCities(regionId?: string) {
    const query = this.db.select().from(schema.cities);
    return regionId ? query.where(eq(schema.cities.regionId, regionId)) : query;
  }

  async createCity(input: { regionId: string; name: string; latitude?: number; longitude?: number }) {
    const [row] = await this.db.insert(schema.cities).values(input).returning();
    return row!;
  }

  async listDestinationCategories(tenantId: string) {
    return this.db
      .select()
      .from(schema.destinationCategories)
      .where(eq(schema.destinationCategories.tenantId, tenantId))
      .orderBy(schema.destinationCategories.name);
  }

  async createDestinationCategory(tenantId: string, input: { name: string; slug: string; parentId?: string; description?: string }) {
    const [row] = await this.db
      .insert(schema.destinationCategories)
      .values(scopedInsert(tenantId, input))
      .returning();
    return row!;
  }

  async listTransferLocations(tenantId: string, cityId?: string) {
    const conditions = [eq(schema.transferLocations.tenantId, tenantId), cityId ? eq(schema.transferLocations.cityId, cityId) : undefined].filter(
      (c): c is NonNullable<typeof c> => Boolean(c)
    );
    return this.db.select().from(schema.transferLocations).where(and(...conditions));
  }

  async createTransferLocation(tenantId: string, input: { cityId: string; name: string; type?: string; address?: string }) {
    const [row] = await this.db
      .insert(schema.transferLocations)
      .values(scopedInsert(tenantId, input))
      .returning();
    return row!;
  }

  // --- Notification templates (spec section 20/44) ---
  async listNotificationTemplates(tenantId: string) {
    return this.db
      .select()
      .from(schema.notificationTemplates)
      .where(eq(schema.notificationTemplates.tenantId, tenantId))
      .orderBy(schema.notificationTemplates.key);
  }

  async upsertNotificationTemplate(
    tenantId: string,
    input: {
      key: string;
      channel: string;
      locale?: string;
      subject?: string;
      bodyTemplate: string;
    }
  ) {
    const locale = input.locale ?? "en";
    const [existing] = await this.db
      .select()
      .from(schema.notificationTemplates)
      .where(
        and(
          eq(schema.notificationTemplates.tenantId, tenantId),
          eq(schema.notificationTemplates.key, input.key),
          eq(schema.notificationTemplates.channel, input.channel),
          eq(schema.notificationTemplates.locale, locale)
        )
      )
      .limit(1);

    if (existing) {
      const [updated] = await this.db
        .update(schema.notificationTemplates)
        .set({ subject: input.subject, bodyTemplate: input.bodyTemplate, updatedAt: new Date() })
        .where(eq(schema.notificationTemplates.id, existing.id))
        .returning();
      return updated!;
    }

    const [created] = await this.db
      .insert(schema.notificationTemplates)
      .values(
        scopedInsert(tenantId, {
          key: input.key,
          channel: input.channel,
          locale,
          subject: input.subject,
          bodyTemplate: input.bodyTemplate,
        })
      )
      .returning();
    return created!;
  }

  // --- Listings management: destinations, packages, accommodation and transport providers.
  // tenantId null = platform admin (all tenants). Soft-deleted rows are hidden unless `deleted` is asked for. ---
  private listingTable(kind: ListingKind): any {
    switch (kind) {
      case "destination": return schema.destinations;
      case "package": return schema.packages;
      case "accommodation": return schema.accommodations;
      case "transport": return schema.transportProviders;
    }
  }

  /** Which fields each kind really has, so an edit never writes a column that doesn't exist. */
  private static readonly EDITABLE: Record<ListingKind, (keyof UpdateListingInput)[]> = {
    destination: ["name", "shortDescription", "description", "status", "featured"],
    package: ["name", "shortDescription", "description", "status", "featured"],
    accommodation: ["name", "description", "status"],
    transport: ["name", "contactPhone"],
  };
  private static readonly HAS_STATUS: Record<ListingKind, boolean> = { destination: true, package: true, accommodation: true, transport: false };

  private listingScope(kind: ListingKind, tenantId: string | null, id?: string, deleted = false) {
    const t = this.listingTable(kind);
    return and(
      id ? eq(t.id, id) : undefined,
      deleted ? sql`${t.deletedAt} is not null` : isNull(t.deletedAt),
      tenantId ? eq(t.tenantId, tenantId) : undefined
    );
  }

  async listListings(
    kind: ListingKind,
    tenantId: string | null,
    q: { page: number; pageSize: number; search?: string; status?: string; deleted?: boolean }
  ) {
    const t = this.listingTable(kind);
    const where = and(
      this.listingScope(kind, tenantId, undefined, q.deleted),
      q.status && AdminOperationsRepository.HAS_STATUS[kind] ? eq(t.status, q.status) : undefined,
      q.search ? ilike(t.name, `%${q.search}%`) : undefined
    );
    const hasOperator = kind !== "destination";
    const base = this.db
      .select({
        id: t.id,
        tenantId: t.tenantId,
        name: t.name,
        slug: kind === "transport" ? sql<string | null>`null` : t.slug,
        status: AdminOperationsRepository.HAS_STATUS[kind] ? t.status : sql<string>`'active'`,
        featured: kind === "destination" || kind === "package" ? t.featured : sql<boolean>`false`,
        createdAt: t.createdAt,
        operatorName: hasOperator ? schema.operators.businessName : sql<string | null>`null`,
        durationDays: kind === "package" ? t.durationDays : sql<number | null>`null`,
      })
      .from(t);
    const joined = hasOperator ? base.leftJoin(schema.operators, eq(t.operatorId, schema.operators.id)) : base;
    const [items, count] = await Promise.all([
      (joined as any).where(where).orderBy(desc(t.createdAt)).limit(q.pageSize).offset((q.page - 1) * q.pageSize),
      this.db.select({ count: sql<number>`count(*)::int` }).from(t).where(where),
    ]);
    return { items: items as any[], total: count[0]?.count ?? 0 };
  }

  async getListing(kind: ListingKind, tenantId: string | null, id: string) {
    const t = this.listingTable(kind);
    const [row] = await this.db.select().from(t).where(this.listingScope(kind, tenantId, id)).limit(1);
    return (row as any) ?? null;
  }

  async updateListing(kind: ListingKind, tenantId: string | null, id: string, patch: UpdateListingInput) {
    const t = this.listingTable(kind);
    const allowed = AdminOperationsRepository.EDITABLE[kind];
    const values: Record<string, unknown> = {};
    for (const key of allowed) if (patch[key] !== undefined) values[key] = patch[key];
    if (Object.keys(values).length === 0) return "nothing" as const;
    if (values.status === "published" && "publishedAt" in t) values.publishedAt = new Date();
    const [row] = await this.db
      .update(t)
      .set({ ...values, updatedAt: new Date() })
      .where(this.listingScope(kind, tenantId, id))
      .returning();
    return (row as any) ?? null;
  }

  async softDeleteListing(kind: ListingKind, tenantId: string | null, id: string) {
    const t = this.listingTable(kind);
    const [row] = await this.db
      .update(t)
      .set({ deletedAt: new Date(), ...(AdminOperationsRepository.HAS_STATUS[kind] ? { status: "archived" } : {}), updatedAt: new Date() })
      .where(this.listingScope(kind, tenantId, id))
      .returning();
    return (row as any) ?? null;
  }

  /** Brings a soft-deleted listing back as a draft (never straight to published) so it can be reviewed first. */
  async restoreListing(kind: ListingKind, tenantId: string | null, id: string) {
    const t = this.listingTable(kind);
    const [row] = await this.db
      .update(t)
      .set({ deletedAt: null, ...(AdminOperationsRepository.HAS_STATUS[kind] ? { status: "draft" } : {}), updatedAt: new Date() })
      .where(this.listingScope(kind, tenantId, id, true))
      .returning();
    return (row as any) ?? null;
  }
}
