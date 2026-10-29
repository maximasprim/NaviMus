import { and, desc, eq, inArray, isNotNull, isNull, schema, sql, type Database } from "@travel/database";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export class TenantRepository {
  constructor(private readonly db: Database) {}

  async findById(id: string) {
    const [row] = await this.db.select().from(schema.tenants).where(and(eq(schema.tenants.id, id), isNull(schema.tenants.deletedAt))).limit(1);
    return row ?? null;
  }

  async findBySlug(slug: string) {
    const [row] = await this.db.select().from(schema.tenants).where(and(eq(schema.tenants.slug, slug), isNull(schema.tenants.deletedAt))).limit(1);
    return row ?? null;
  }

  async create(input: { name: string; slug?: string; status?: string }) {
    const slug = input.slug ?? slugify(input.name);
    const [row] = await this.db.insert(schema.tenants).values({ name: input.name, slug, status: input.status ?? "active" }).returning();
    return row!;
  }

  async setOwner(tenantId: string, ownerUserId: string) {
    await this.db.update(schema.tenants).set({ ownerUserId, updatedAt: new Date() }).where(eq(schema.tenants.id, tenantId));
  }

  async list(page: number, pageSize: number, status?: string) {
    const offset = (page - 1) * pageSize;
    const conditions = [isNull(schema.tenants.deletedAt), status ? eq(schema.tenants.status, status) : undefined].filter(
      (c): c is NonNullable<typeof c> => Boolean(c)
    );
    const [items, countRows] = await Promise.all([
      this.db
        .select()
        .from(schema.tenants)
        .where(and(...conditions))
        .orderBy(desc(schema.tenants.createdAt))
        .limit(pageSize)
        .offset(offset),
      this.db.select({ count: sql<number>`count(*)::int` }).from(schema.tenants).where(and(...conditions)),
    ]);
    return { items, total: countRows[0]?.count ?? 0 };
  }

  async update(id: string, input: { name?: string; settings?: Record<string, unknown> }) {
    const [row] = await this.db
      .update(schema.tenants)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(schema.tenants.id, id))
      .returning();
    return row ?? null;
  }

  async suspend(id: string, reason: string | undefined) {
    const [row] = await this.db
      .update(schema.tenants)
      .set({ status: "suspended", suspendedAt: new Date(), suspendedReason: reason, updatedAt: new Date() })
      .where(eq(schema.tenants.id, id))
      .returning();
    return row ?? null;
  }

  async reactivate(id: string) {
    const [row] = await this.db
      .update(schema.tenants)
      .set({ status: "active", suspendedAt: null, suspendedReason: null, updatedAt: new Date() })
      .where(eq(schema.tenants.id, id))
      .returning();
    return row ?? null;
  }

  /**
   * Claims a custom domain for this tenant, unverified. The partial
   * unique index on customDomain (see schema/tenants.ts) is what stops
   * two tenants from both claiming the same domain at once, even before
   * either has verified it - first to claim wins the slot, verification
   * comes after. verificationToken is stashed in `settings` (see
   * schema comment on why customDomain graduated to its own column but
   * this transient value didn't) so verifyCustomDomain can check it
   * later without a dedicated column for something that's discarded
   * once verification succeeds.
   */
  async setCustomDomain(tenantId: string, domain: string, verificationToken: string) {
    const tenant = await this.findById(tenantId);
    if (!tenant) return null;
    const [row] = await this.db
      .update(schema.tenants)
      .set({
        customDomain: domain,
        customDomainVerifiedAt: null,
        settings: { ...((tenant.settings as Record<string, unknown>) ?? {}), customDomainVerificationToken: verificationToken },
        updatedAt: new Date(),
      })
      .where(eq(schema.tenants.id, tenantId))
      .returning();
    return row ?? null;
  }

  async markCustomDomainVerified(tenantId: string) {
    const [row] = await this.db
      .update(schema.tenants)
      .set({ customDomainVerifiedAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.tenants.id, tenantId))
      .returning();
    return row ?? null;
  }

  async clearCustomDomain(tenantId: string) {
    const [row] = await this.db
      .update(schema.tenants)
      .set({ customDomain: null, customDomainVerifiedAt: null, updatedAt: new Date() })
      .where(eq(schema.tenants.id, tenantId))
      .returning();
    return row ?? null;
  }

  /**
   * Looks up a tenant by its custom domain, but ONLY when that domain
   * has been verified (customDomainVerifiedAt is set) and the tenant
   * hasn't been soft-deleted. Backs the public domain-resolve endpoint
   * that apps/web calls on every request to a non-subdomain host - the
   * same "verified-only" rule the API gateway's own resolveTenant
   * enforces (see apps/api-gateway/src/index.ts), so a tenant merely
   * typing a domain into settings can never make the storefront (or the
   * API) serve their content under someone else's unclaimed domain.
   */
  async findByVerifiedDomain(domain: string) {
    const [row] = await this.db
      .select()
      .from(schema.tenants)
      .where(
        and(
          eq(schema.tenants.customDomain, domain),
          isNotNull(schema.tenants.customDomainVerifiedAt),
          isNull(schema.tenants.deletedAt)
        )
      )
      .limit(1);
    return row ?? null;
  }

  /**
   * Compensating action ONLY - used when tenant creation succeeds but
   * creating the tenant's first user then fails, to avoid leaving behind
   * an orphaned tenant nobody can ever log into. Safe as a hard delete
   * specifically because nothing can reference a tenant that's only
   * microseconds old and never got an owner. Never call this on an
   * established tenant - use suspend() instead, which is reversible and
   * audited.
   */
  async deleteIfNoOwner(id: string) {
    await this.db.delete(schema.tenants).where(and(eq(schema.tenants.id, id), isNull(schema.tenants.ownerUserId)));
  }

  // --- Plans (spec: multi-tenancy Phase 5 billing) ---
  async listPlans(activeOnly = false) {
    return this.db
      .select()
      .from(schema.plans)
      .where(activeOnly ? eq(schema.plans.isActive, true) : undefined)
      .orderBy(schema.plans.monthlyPriceUsd);
  }

  async findPlanById(planId: string) {
    const [row] = await this.db.select().from(schema.plans).where(eq(schema.plans.id, planId)).limit(1);
    return row ?? null;
  }

  async assignPlan(tenantId: string, planId: string | null) {
    const [row] = await this.db
      .update(schema.tenants)
      .set({ planId, updatedAt: new Date() })
      .where(eq(schema.tenants.id, tenantId))
      .returning();
    return row ?? null;
  }

  /**
   * Permanently and irreversibly deletes every row belonging to this
   * tenant. NOT the same as suspend() - suspend flips a status flag and
   * is fully reversible; this actually removes the data, for
   * GDPR-style right-to-erasure requests or reclaiming storage from a
   * long-cancelled tenant.
   *
   * Deletion order matters and is NOT arbitrary: most child tables
   * (booking_items, room_types, package_prices, etc.) already cascade
   * automatically once their tenant-scoped parent row is deleted (see
   * each schema file's `onDelete: "cascade"`), but several ROOT tables
   * reference each other WITHOUT cascade (payments/invoices/reviews ->
   * bookings, bookings -> packages, packages/accommodations/
   * transport_providers -> operators - all explicit "restrict" or the
   * Postgres default NO ACTION), so those have to be deleted in
   * dependency order by hand or the transaction fails outright on a
   * live foreign-key violation. notification_logs is handled explicitly
   * too, ahead of users, rather than relying on its onDelete:"set null"
   * - a true erasure should remove the content, not just orphan the
   * reference to who it was about.
   *
   * Everything runs in ONE transaction: if any step fails, nothing is
   * deleted, rather than leaving a tenant half-erased.
   */
  async hardDelete(tenantId: string) {
    await this.db.transaction(async (tx) => {
      const tenantUserIds = tx
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.tenantId, tenantId));

      // Content tied to users, ahead of deleting the users themselves -
      // see doc comment above on why this isn't left to onDelete:"set null".
      await tx.delete(schema.notificationLogs).where(inArray(schema.notificationLogs.userId, tenantUserIds));

      // Financial records referencing bookings/payments without cascade.
      await tx.delete(schema.receipts).where(eq(schema.receipts.tenantId, tenantId));
      await tx.delete(schema.invoices).where(eq(schema.invoices.tenantId, tenantId));
      await tx.delete(schema.payments).where(eq(schema.payments.tenantId, tenantId));
      await tx.delete(schema.reviews).where(eq(schema.reviews.tenantId, tenantId));

      // Bookings reference packages (restrict) - must go before packages.
      await tx.delete(schema.bookings).where(eq(schema.bookings.tenantId, tenantId));

      await tx.delete(schema.coupons).where(eq(schema.coupons.tenantId, tenantId));
      await tx.delete(schema.promotions).where(eq(schema.promotions.tenantId, tenantId));
      await tx.delete(schema.airportTransfers).where(eq(schema.airportTransfers.tenantId, tenantId));
      await tx.delete(schema.transferLocations).where(eq(schema.transferLocations.tenantId, tenantId));
      await tx.delete(schema.cancellationPolicies).where(eq(schema.cancellationPolicies.tenantId, tenantId));

      // Catalog tables reference operators - must go before operators.
      await tx.delete(schema.packages).where(eq(schema.packages.tenantId, tenantId));
      await tx.delete(schema.accommodations).where(eq(schema.accommodations.tenantId, tenantId));
      await tx.delete(schema.transportProviders).where(eq(schema.transportProviders.tenantId, tenantId));
      await tx.delete(schema.vehicleTypes).where(eq(schema.vehicleTypes.tenantId, tenantId));

      await tx.delete(schema.destinations).where(eq(schema.destinations.tenantId, tenantId));
      await tx.delete(schema.destinationCategories).where(eq(schema.destinationCategories.tenantId, tenantId));
      await tx.delete(schema.notificationTemplates).where(eq(schema.notificationTemplates.tenantId, tenantId));

      // Now safe: nothing left references operators or users.
      await tx.delete(schema.operators).where(eq(schema.operators.tenantId, tenantId));
      await tx.delete(schema.users).where(eq(schema.users.tenantId, tenantId));

      // Tenant-scoped audit/settings rows - platform-level ones
      // (tenantId null, including the "tenant deleted" entry the caller
      // writes right after this transaction commits) are untouched.
      await tx.delete(schema.auditLogs).where(eq(schema.auditLogs.tenantId, tenantId));
      await tx.delete(schema.systemSettings).where(eq(schema.systemSettings.tenantId, tenantId));

      await tx.delete(schema.tenants).where(eq(schema.tenants.id, tenantId));
    });
  }

  /**
   * See TenantService.exportData's doc comment for what's in scope and
   * why. Users have passwordHash/mfaSecret stripped at the query level
   * (never selected, not just redacted after the fact) - this data
   * leaves the database, so there's no version of "select everything
   * then delete the sensitive fields" that isn't a real risk if a
   * future edit here forgets the redaction step.
   */
  async exportData(tenant: typeof schema.tenants.$inferSelect) {
    const tenantId = tenant.id;
    const [users, operators, destinations, packages, bookings, payments, invoices, reviews] = await Promise.all([
      this.db
        .select({
          id: schema.users.id,
          email: schema.users.email,
          firstName: schema.users.firstName,
          lastName: schema.users.lastName,
          phone: schema.users.phone,
          status: schema.users.status,
          createdAt: schema.users.createdAt,
        })
        .from(schema.users)
        .where(eq(schema.users.tenantId, tenantId)),
      this.db.select().from(schema.operators).where(eq(schema.operators.tenantId, tenantId)),
      this.db.select().from(schema.destinations).where(eq(schema.destinations.tenantId, tenantId)),
      this.db.select().from(schema.packages).where(eq(schema.packages.tenantId, tenantId)),
      this.db.select().from(schema.bookings).where(eq(schema.bookings.tenantId, tenantId)),
      this.db.select().from(schema.payments).where(eq(schema.payments.tenantId, tenantId)),
      this.db.select().from(schema.invoices).where(eq(schema.invoices.tenantId, tenantId)),
      this.db.select().from(schema.reviews).where(eq(schema.reviews.tenantId, tenantId)),
    ]);

    return {
      exportedAt: new Date().toISOString(),
      tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug, status: tenant.status, createdAt: tenant.createdAt },
      users,
      operators,
      destinations,
      packages,
      bookings,
      payments,
      invoices,
      reviews,
    };
  }
}
