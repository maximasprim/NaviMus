import { DEFAULT_TENANT_ID, DEFAULT_TENANT_SLUG } from "@travel/database";
import { ConflictError, NotFoundError, ValidationError } from "@travel/types";
import { createServiceLogger } from "@travel/logger";
import {
  DEFAULT_SITE_CONTENT,
  SITE_CONTENT_SECTIONS,
  mergeSiteContent,
  siteContentSchema,
  isAllowedVideoUrl,
  type SiteContent,
  type UpdateSiteContentInput,
  type UpdateSiteIdentityInput,
} from "@travel/validation";
import type { SiteContentRepository } from "./site-content-repository.js";
import type { AdminOperationsRepository } from "../repositories/admin-operations-repository.js";

const logger = createServiceLogger("site-content");

export interface SiteIdentity {
  id: string;
  name: string;
  slug: string;
  status: string;
  customDomain: string | null;
  customDomainVerifiedAt: Date | null;
}

export class SiteContentService {
  constructor(
    private readonly repo: SiteContentRepository,
    private readonly ops: AdminOperationsRepository,
    /**
     * Hosts NEW hero video links must come from (see MEDIA_* in @travel/config). Empty = unrestricted, which is
     * what local development and every existing deployment without storage configured keeps getting.
     */
    private readonly allowedVideoHosts: readonly string[] = []
  ) {}

  /**
   * What the storefront renders. Never throws on bad stored data: if a stored document no longer
   * validates (e.g. hand-edited in the database, or written by an older schema), the site falls back
   * to the defaults instead of going down.
   */
  async getPublic(tenantId: string): Promise<{ content: SiteContent; updatedAt: string | null }> {
    const row = await this.repo.find(tenantId);
    return { content: mergeSiteContent(DEFAULT_SITE_CONTENT, this.parseStored(row?.content, tenantId)), updatedAt: row?.updatedAt?.toISOString() ?? null };
  }

  /** Everything the editor needs: identity, what's overridden, what visitors see now, and the defaults. */
  async getForAdmin(tenantId: string) {
    const [tenant, row] = await Promise.all([this.repo.findTenant(tenantId), this.repo.find(tenantId)]);
    if (!tenant) throw new NotFoundError("Tenant");
    const stored = this.parseStored(row?.content, tenantId);
    return {
      identity: tenant,
      stored,
      effective: mergeSiteContent(DEFAULT_SITE_CONTENT, stored),
      defaults: DEFAULT_SITE_CONTENT as SiteContent,
      updatedAt: row?.updatedAt?.toISOString() ?? null,
    };
  }

  /**
   * Section-level update: a provided section replaces the stored one, `null` resets it to the defaults,
   * an omitted section is untouched. The merged result is re-validated before anything is written.
   */
  async updateContent(tenantId: string, input: UpdateSiteContentInput, actorUserId: string) {
    const tenant = await this.repo.findTenant(tenantId);
    if (!tenant) throw new NotFoundError("Tenant");

    const row = await this.repo.find(tenantId);
    const next: Record<string, unknown> = { ...this.parseStored(row?.content, tenantId) };
    const saved: string[] = [];
    const reset: string[] = [];
    for (const section of SITE_CONTENT_SECTIONS) {
      if (!(section in input)) continue;
      const value = input[section];
      if (value === null) {
        delete next[section];
        reset.push(section);
      } else if (value !== undefined) {
        next[section] = value;
        saved.push(section);
      }
    }

    const checked = siteContentSchema.safeParse(next);
    if (!checked.success) throw new ValidationError("Site content is invalid", checked.error.flatten());

    this.assertVideoHostsAllowed(tenantId, row?.content, checked.data);

    await this.repo.upsert(tenantId, checked.data as Record<string, unknown>, actorUserId);
    await this.ops.writeAuditLog({
      tenantId,
      actorUserId,
      action: "site.content_updated",
      resourceType: "tenant_site_content",
      resourceId: tenantId,
      metadata: { saved, reset },
    });
    return this.getForAdmin(tenantId);
  }

  /**
   * Name and slug. The slug is the tenant's public address (subdomain) AND the key the gateway
   * resolves tenants by, so changing it is deliberately hard to do by accident.
   */
  async updateIdentity(tenantId: string, input: UpdateSiteIdentityInput, actorUserId: string): Promise<SiteIdentity> {
    const tenant = await this.repo.findTenant(tenantId);
    if (!tenant) throw new NotFoundError("Tenant");

    const patch: { name?: string; slug?: string } = {};
    if (input.name !== undefined && input.name !== tenant.name) patch.name = input.name;

    if (input.slug !== undefined && input.slug !== tenant.slug) {
      // The seeded default tenant is what local development, the e2e suite and the platform's own fallbacks resolve by.
      if (tenant.id === DEFAULT_TENANT_ID || tenant.slug === DEFAULT_TENANT_SLUG) {
        throw new ValidationError(`The "${DEFAULT_TENANT_SLUG}" tenant's address is fixed and cannot be changed`);
      }
      if (input.confirmSlugChange !== true) {
        throw new ValidationError("Changing the address moves your site and the old address stops working - confirm to continue");
      }
      if (await this.repo.isSlugTaken(input.slug, tenantId)) {
        throw new ConflictError(`The address "${input.slug}" is already taken`);
      }
      patch.slug = input.slug;
    }

    if (Object.keys(patch).length === 0) return tenant;

    let updated;
    try {
      updated = await this.repo.updateTenantIdentity(tenantId, patch);
    } catch (err) {
      // Lost a race with another tenant claiming the same slug between the check above and this write.
      if ((err as { code?: string } | null)?.code === "23505") throw new ConflictError(`The address "${patch.slug}" is already taken`);
      throw err;
    }
    if (!updated) throw new NotFoundError("Tenant");

    await this.ops.writeAuditLog({
      tenantId,
      actorUserId,
      action: patch.slug ? "site.address_changed" : "site.identity_updated",
      resourceType: "tenant",
      resourceId: tenantId,
      metadata: {
        ...(patch.name ? { name: { from: tenant.name, to: patch.name } } : {}),
        ...(patch.slug ? { slug: { from: tenant.slug, to: patch.slug } } : {}),
      },
    });
    return updated;
  }

  /**
   * Hero videos load on every visitor's home page, so a NEW link must come from our own storage / CDN (or an
   * explicitly allowed host) rather than any third party. Links already saved are left alone, so tenants who
   * linked a clip before this check existed can still save other changes without having to re-upload.
   */
  private assertVideoHostsAllowed(tenantId: string, previousRaw: unknown, next: SiteContent) {
    if (this.allowedVideoHosts.length === 0) return;
    const previous = new Set(this.parseStored(previousRaw, tenantId).hero?.videoUrls ?? []);
    const rejected = (next.hero?.videoUrls ?? []).filter((u) => !previous.has(u) && !isAllowedVideoUrl(u, this.allowedVideoHosts));
    if (rejected.length > 0) {
      throw new ValidationError("Background videos must be uploaded here (or hosted on an approved domain). Use the Upload button instead of a link to another site.", {
        videoUrls: rejected,
      });
    }
  }

  private parseStored(raw: unknown, tenantId: string): SiteContent {
    if (raw === null || raw === undefined) return {};
    const parsed = siteContentSchema.safeParse(raw);
    if (parsed.success) return parsed.data;
    logger.warn({ tenantId, issues: parsed.error.issues.slice(0, 3) }, "stored site content failed validation; serving defaults");
    return {};
  }
}
