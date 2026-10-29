import { and, eq, not, schema, type Database } from "@travel/database";

/** Storage for a tenant's public site content, plus the two tenant columns (name, slug) the Identity tab edits. */
export class SiteContentRepository {
  constructor(private readonly db: Database) {}

  async find(tenantId: string) {
    const [row] = await this.db
      .select()
      .from(schema.tenantSiteContent)
      .where(eq(schema.tenantSiteContent.tenantId, tenantId))
      .limit(1);
    return row ?? null;
  }

  async upsert(tenantId: string, content: Record<string, unknown>, updatedByUserId: string) {
    const [row] = await this.db
      .insert(schema.tenantSiteContent)
      .values({ tenantId, content, updatedByUserId })
      .onConflictDoUpdate({
        target: schema.tenantSiteContent.tenantId,
        set: { content, updatedByUserId, updatedAt: new Date() },
      })
      .returning();
    return row!;
  }

  async findTenant(tenantId: string) {
    const [row] = await this.db
      .select({
        id: schema.tenants.id,
        name: schema.tenants.name,
        slug: schema.tenants.slug,
        status: schema.tenants.status,
        customDomain: schema.tenants.customDomain,
        customDomainVerifiedAt: schema.tenants.customDomainVerifiedAt,
      })
      .from(schema.tenants)
      .where(eq(schema.tenants.id, tenantId))
      .limit(1);
    return row ?? null;
  }

  /**
   * True if ANY other tenant row - including a soft-deleted one - already uses this slug. The unique
   * index on tenants.slug covers soft-deleted rows too, so ignoring them here would turn a clean
   * "already taken" answer into a database error.
   */
  async isSlugTaken(slug: string, exceptTenantId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: schema.tenants.id })
      .from(schema.tenants)
      .where(and(eq(schema.tenants.slug, slug), not(eq(schema.tenants.id, exceptTenantId))))
      .limit(1);
    return Boolean(row);
  }

  async updateTenantIdentity(tenantId: string, patch: { name?: string; slug?: string }) {
    const [row] = await this.db
      .update(schema.tenants)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(schema.tenants.id, tenantId))
      .returning({
        id: schema.tenants.id,
        name: schema.tenants.name,
        slug: schema.tenants.slug,
        status: schema.tenants.status,
        customDomain: schema.tenants.customDomain,
        customDomainVerifiedAt: schema.tenants.customDomainVerifiedAt,
      });
    return row ?? null;
  }
}
