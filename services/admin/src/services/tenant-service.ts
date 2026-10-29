import { ConflictError, NotFoundError } from "@travel/types";
import type { CreateTenantInput, UpdateTenantInput } from "@travel/validation";
import { AuthService } from "@travel/service-auth/internal";
import { getTenantUsageSnapshot, type Database } from "@travel/database";
import { isEntitled } from "../billing/subscription-sync.js";
import type { TenantRepository } from "../repositories/tenant-repository.js";
import type { AdminOperationsRepository } from "../repositories/admin-operations-repository.js";
import type { MetricsRepository } from "../repositories/metrics-repository.js";
import { VERIFICATION_SUBDOMAIN, generateVerificationToken, verifyDomainOwnership } from "../domain-verification.js";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/**
 * Platform-level tenant management - every method here is mounted only
 * under /api/v1/platform, gated to the super_admin role at the route
 * layer (see platform-routes.ts). This is the one part of the system
 * that operates ABOVE tenant boundaries rather than within one, which
 * is why writeAuditLog calls here always pass tenantId: null (see
 * audit_logs' schema comment for why that's the correct choice, not an
 * oversight).
 */
export class TenantService {
  constructor(
    private readonly tenants: TenantRepository,
    private readonly authService: AuthService,
    private readonly ops: AdminOperationsRepository,
    private readonly metrics: MetricsRepository,
    private readonly db: Database
  ) {}

  /**
   * Creates a tenant and its first user (with the "admin" role for
   * that tenant) together. These are two separate inserts against two
   * different services' repositories (tenants here, users via
   * @travel/service-auth/internal) rather than one DB transaction -
   * cross-service atomicity would mean either merging the two
   * services or passing a raw tx handle across a service boundary,
   * both worse than the compensating-delete approach below for
   * something this infrequent (tenant creation is an admin action,
   * not a hot path).
   */
  /**
   * Used by both the super_admin creation flow (platform-routes.ts,
   * status defaults to "active") and self-serve signup (public-routes.ts,
   * which passes status: "trial") - the two differ only in who's allowed
   * to call this, what status the new tenant starts in, and what gets
   * written to the audit trail, not in how tenant+owner creation itself
   * works.
   */
  async createTenant(
    input: CreateTenantInput,
    actorUserId: string,
    options: { status?: string; auditAction?: string; actorIsNewOwner?: boolean } = {}
  ) {
    const slug = input.slug ?? slugify(input.name);
    const existing = await this.tenants.findBySlug(slug);
    if (existing) {
      throw new ConflictError(`A tenant with slug "${slug}" already exists`);
    }

    const tenant = await this.tenants.create({ name: input.name, slug, status: options.status });

    try {
      const { userId } = await this.authService.createTenantOwner(tenant.id, {
        email: input.ownerEmail,
        password: input.ownerPassword,
        firstName: input.ownerFirstName,
        lastName: input.ownerLastName,
        phone: input.ownerPhone,
      });
      await this.tenants.setOwner(tenant.id, userId);
      await this.ops.writeAuditLog({
        tenantId: null,
        actorUserId: options.actorIsNewOwner ? userId : actorUserId,
        action: options.auditAction ?? "tenant.created",
        resourceType: "tenant",
        resourceId: tenant.id,
        metadata: { name: tenant.name, slug: tenant.slug, ownerUserId: userId },
      });
      return { ...tenant, ownerUserId: userId };
    } catch (err) {
      // See deleteIfNoOwner's doc comment - this is a compensating
      // action for exactly this failure case, not a general-purpose delete.
      await this.tenants.deleteIfNoOwner(tenant.id);
      throw err;
    }
  }

  /**
   * Public, unauthenticated entry point (services/admin's
   * public-routes.ts) - a business signing itself up rather than being
   * created by a super_admin. The only real differences from
   * createTenant above: no authenticated actor exists yet (the new
   * owner IS the actor, for audit purposes - actorIsNewOwner: true), and
   * the tenant starts in "trial" rather than "active" - a sensible
   * product default for self-serve, and one you (the super_admin) can
   * upgrade via updateTenant/PATCH once they've been vetted or paid,
   * rather than every self-signup silently getting full production access.
   */
  async signUp(input: CreateTenantInput) {
    return this.createTenant(input, "", { status: "trial", auditAction: "tenant.self_signup", actorIsNewOwner: true });
  }

  async listTenants(page: number, pageSize: number, status?: string) {
    return this.tenants.list(page, pageSize, status);
  }

  /** Includes a live dashboard snapshot (reusing MetricsRepository, scoped to this one tenant) so a super_admin doesn't have to open a second screen to see if a tenant is actually active. */
  async getTenant(id: string) {
    const tenant = await this.tenants.findById(id);
    if (!tenant) throw new NotFoundError("Tenant");
    const [activeCounts, bookingCounts] = await Promise.all([
      this.metrics.getActiveCounts(id),
      this.metrics.getBookingCounts(id, {}),
    ]);
    return { ...tenant, ...activeCounts, totalBookings: bookingCounts.total };
  }

  async updateTenant(id: string, input: UpdateTenantInput, actorUserId: string) {
    const existing = await this.tenants.findById(id);
    if (!existing) throw new NotFoundError("Tenant");
    const updated = await this.tenants.update(id, input);
    await this.ops.writeAuditLog({
      tenantId: null,
      actorUserId,
      action: "tenant.updated",
      resourceType: "tenant",
      resourceId: id,
      metadata: input,
    });
    return updated!;
  }

  async suspendTenant(id: string, reason: string | undefined, actorUserId: string) {
    const existing = await this.tenants.findById(id);
    if (!existing) throw new NotFoundError("Tenant");
    const updated = await this.tenants.suspend(id, reason);
    await this.ops.writeAuditLog({
      tenantId: null,
      actorUserId,
      action: "tenant.suspended",
      resourceType: "tenant",
      resourceId: id,
      metadata: reason ? { reason } : undefined,
    });
    return updated!;
  }

  async reactivateTenant(id: string, actorUserId: string) {
    const existing = await this.tenants.findById(id);
    if (!existing) throw new NotFoundError("Tenant");
    const updated = await this.tenants.reactivate(id);
    await this.ops.writeAuditLog({
      tenantId: null,
      actorUserId,
      action: "tenant.reactivated",
      resourceType: "tenant",
      resourceId: id,
    });
    return updated!;
  }

  /**
   * Starts custom-domain setup: claims the domain (unverified - see
   * TenantRepository.setCustomDomain's doc comment on the claim-before-
   * verify ordering) and returns the DNS record the tenant needs to
   * publish. Called by the tenant's OWN admin (self-service, via
   * buildAdminRoutes scoped to their own tenantId), not a super_admin -
   * this is your business's domain to prove you own, not something a
   * platform operator does on your behalf.
   */
  async requestCustomDomain(tenantId: string, domain: string, actorUserId: string) {
    const normalized = domain.trim().toLowerCase().replace(/^www\./, "");
    const token = generateVerificationToken();
    let updated;
    try {
      updated = await this.tenants.setCustomDomain(tenantId, normalized, token);
    } catch (err: any) {
      // Postgres unique_violation on the partial customDomain index -
      // someone (possibly this same tenant, possibly another) already
      // claimed this domain.
      if (err?.code === "23505") {
        throw new ConflictError(`The domain "${normalized}" is already in use by another tenant`);
      }
      throw err;
    }
    if (!updated) throw new NotFoundError("Tenant");

    await this.ops.writeAuditLog({
      tenantId,
      actorUserId,
      action: "tenant.custom_domain.requested",
      resourceType: "tenant",
      resourceId: tenantId,
      metadata: { domain: normalized },
    });

    return {
      domain: normalized,
      verified: false,
      dnsRecord: { type: "TXT", name: `${VERIFICATION_SUBDOMAIN}.${normalized}`, value: token },
    };
  }

  /**
   * Performs the actual DNS lookup (see domain-verification.ts) and, if
   * the expected TXT record is found, marks the domain verified - from
   * that point on, tenant-context.ts's gateway resolver will start
   * answering requests to this domain as this tenant. Safe to call
   * repeatedly (e.g. a "check again" button) before the tenant has
   * actually published the DNS record yet; it just keeps returning
   * verified: false until they have.
   */
  async verifyCustomDomain(tenantId: string, actorUserId: string) {
    const tenant = await this.tenants.findById(tenantId);
    if (!tenant) throw new NotFoundError("Tenant");
    if (!tenant.customDomain) {
      throw new ConflictError("No custom domain has been requested for this tenant yet");
    }
    if (tenant.customDomainVerifiedAt) {
      return { domain: tenant.customDomain, verified: true };
    }

    const token = (tenant.settings as Record<string, unknown> | null)?.customDomainVerificationToken as string | undefined;
    if (!token) {
      // Shouldn't happen (setCustomDomain always sets it alongside
      // customDomain), but fail closed rather than crash if it does.
      throw new ConflictError("No verification token on file - request the domain again");
    }

    const ok = await verifyDomainOwnership(tenant.customDomain, token);
    if (!ok) {
      return { domain: tenant.customDomain, verified: false };
    }

    await this.tenants.markCustomDomainVerified(tenantId);
    await this.ops.writeAuditLog({
      tenantId,
      actorUserId,
      action: "tenant.custom_domain.verified",
      resourceType: "tenant",
      resourceId: tenantId,
      metadata: { domain: tenant.customDomain },
    });
    return { domain: tenant.customDomain, verified: true };
  }

  async removeCustomDomain(tenantId: string, actorUserId: string) {
    const tenant = await this.tenants.findById(tenantId);
    if (!tenant) throw new NotFoundError("Tenant");
    await this.tenants.clearCustomDomain(tenantId);
    await this.ops.writeAuditLog({
      tenantId,
      actorUserId,
      action: "tenant.custom_domain.removed",
      resourceType: "tenant",
      resourceId: tenantId,
      metadata: { domain: tenant.customDomain },
    });
  }

  /**
   * Public counterpart to the gateway's own resolveTenant (see
   * apps/api-gateway/src/index.ts): given a Host header that isn't a
   * subdomain of the platform's own domain, apps/web calls this to find
   * out which tenant it should render as. Returns only the slug - never
   * the tenant row itself - since this endpoint is unauthenticated by
   * necessity (the visitor has no tenant context yet, that's exactly
   * what's being resolved) and a slug is all the storefront needs to
   * fetch that tenant's public catalog.
   */
  async resolveByDomain(domain: string): Promise<{ slug: string } | null> {
    const normalized = domain.trim().toLowerCase().replace(/^www\./, "");
    const tenant = await this.tenants.findByVerifiedDomain(normalized);
    return tenant ? { slug: tenant.slug } : null;
  }

  // --- Plans (spec: multi-tenancy Phase 5 billing) ---
  async listPlans(activeOnly = false) {
    return this.tenants.listPlans(activeOnly);
  }

  /** The tenant's own "Usage & Billing" screen - current plan, live usage, and which limits (if any) are currently maxed out. */
  async getUsage(tenantId: string) {
    return getTenantUsageSnapshot(this.db, tenantId);
  }

  /**
   * Assigns (or clears, with planId null) a tenant's plan BY HAND. Super_admin
   * only (enforced at the route layer). This is for tenants billed outside
   * Stripe (enterprise contracts, comped accounts); self-serve tenants
   * subscribe through BillingService, and this refuses to touch a tenant
   * whose plan is currently driven by a live Stripe subscription.
   */
  async assignPlan(tenantId: string, planId: string | null, actorUserId: string) {
    const tenant = await this.tenants.findById(tenantId);
    if (!tenant) throw new NotFoundError("Tenant");
    // A tenant paying through Stripe has its plan driven by the subscription.
    // Assigning one by hand would be silently overwritten by the next webhook
    // (or, worse, leave them paying for one plan and entitled to another).
    if (isEntitled(tenant.subscriptionStatus)) {
      throw new ConflictError(
        `This tenant has an active Stripe subscription (${tenant.subscriptionStatus}); its plan is managed through Stripe. Change or cancel the subscription there instead.`
      );
    }
    if (planId) {
      const plan = await this.tenants.findPlanById(planId);
      if (!plan) throw new NotFoundError("Plan");
    }
    const updated = await this.tenants.assignPlan(tenantId, planId);
    await this.ops.writeAuditLog({
      tenantId: null,
      actorUserId,
      action: "tenant.plan_assigned",
      resourceType: "tenant",
      resourceId: tenantId,
      metadata: { planId },
    });
    return updated!;
  }

  /**
   * Permanently and irreversibly deletes a tenant and every row it
   * owns - see TenantRepository.hardDelete's doc comment for exactly
   * what that does and doesn't clean up. Gated behind "must already be
   * suspended": a real system shouldn't let anyone casually erase an
   * active, in-use tenant's data - suspending first is the deliberate
   * pause that gives a chance to notice a mistake before it becomes
   * unrecoverable. `expectedSlug` is a confirmation echo (the caller
   * must submit the tenant's own slug back, like typing a repo name to
   * delete it on GitHub) - a second, human-legible check beyond just
   * having the right permission and the right id.
   *
   * The final audit entry is written AFTER the tenant is gone, with
   * tenantId: null (this is now unambiguously a platform-level record,
   * not that tenant's own audit trail, which no longer exists) - see
   * audit_logs' schema comment on why platform actions get a null
   * tenantId rather than attributing them to an arbitrary tenant.
   */
  async hardDelete(tenantId: string, expectedSlug: string, actorUserId: string) {
    const tenant = await this.tenants.findById(tenantId);
    if (!tenant) throw new NotFoundError("Tenant");
    if (tenant.status !== "suspended") {
      throw new ConflictError("Suspend this tenant before permanently deleting it");
    }
    if (tenant.slug !== expectedSlug) {
      throw new ConflictError("Confirmation slug does not match this tenant");
    }

    await this.tenants.hardDelete(tenantId);

    await this.ops.writeAuditLog({
      tenantId: null,
      actorUserId,
      action: "tenant.deleted",
      resourceType: "tenant",
      resourceId: tenantId,
      metadata: { name: tenant.name, slug: tenant.slug },
    });
  }

  /**
   * Bundles a tenant's core data into one JSON-serializable object -
   * for a GDPR-style data-portability request, or as a safety copy
   * before hardDelete. Deliberately NOT exhaustive: it covers the data
   * an operator or a customer would actually recognize as "our data"
   * (catalog, bookings, financial records, reviews, staff) rather than
   * every internal table (search logs, notification delivery logs,
   * audit trails) - see ExportBundle's shape for exactly what's
   * included. User records have passwordHash/mfaSecret stripped; this
   * is a data export, not a credential dump.
   */
  async exportData(tenantId: string) {
    const tenant = await this.tenants.findById(tenantId);
    if (!tenant) throw new NotFoundError("Tenant");
    return this.tenants.exportData(tenant);
  }
}
