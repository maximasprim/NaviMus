import { and, asc, desc, eq, isNull, schema, sql, withTenant, scopedInsert, type Database } from "@travel/database";
import type { OperatorSearchQuery, RegisterOperatorInput } from "@travel/validation";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export class OperatorRepository {
  constructor(private readonly db: Database) {}

  async search(tenantId: string, query: OperatorSearchQuery) {
    const conditions = [eq(schema.operators.tenantId, tenantId), isNull(schema.operators.deletedAt)];
    if (query.status) conditions.push(eq(schema.operators.status, query.status));

    const offset = (query.page - 1) * query.pageSize;
    const [items, countRows] = await Promise.all([
      this.db
        .select()
        .from(schema.operators)
        .where(and(...conditions))
        .orderBy(query.order === "asc" ? asc(schema.operators.createdAt) : desc(schema.operators.createdAt))
        .limit(query.pageSize)
        .offset(offset),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.operators)
        .where(and(...conditions)),
    ]);
    return { items, total: countRows[0]?.count ?? 0 };
  }

  async findById(tenantId: string, id: string) {
    const [row] = await this.db
      .select()
      .from(schema.operators)
      .where(withTenant(schema.operators.tenantId, tenantId, eq(schema.operators.id, id), isNull(schema.operators.deletedAt)))
      .limit(1);
    return row ?? null;
  }

  /**
   * The operator a given user is staff of - used to resolve `operatorId`
   * server-side instead of trusting a client-supplied one. This is the
   * function EVERY other service's write routes call before touching a
   * package/accommodation/route - so scoping it by tenant here is what
   * ultimately stops a user from ever resolving to an operator outside
   * their own tenant, even though by construction (see register()) a
   * user and their operator are always created in the same tenant.
   */
  async findOperatorForUser(tenantId: string, userId: string) {
    const [row] = await this.db
      .select({ operator: schema.operators })
      .from(schema.operatorUsers)
      .innerJoin(schema.operators, eq(schema.operatorUsers.operatorId, schema.operators.id))
      .where(withTenant(schema.operators.tenantId, tenantId, eq(schema.operatorUsers.userId, userId), isNull(schema.operators.deletedAt)))
      .limit(1);
    return row?.operator ?? null;
  }

  async register(tenantId: string, userId: string, input: RegisterOperatorInput) {
    const slug = input.slug ?? slugify(input.businessName);
    return this.db.transaction(async (tx) => {
      const [operator] = await tx
        .insert(schema.operators)
        .values(
          scopedInsert(tenantId, {
            businessName: input.businessName,
            slug,
            contactEmail: input.contactEmail,
            contactPhone: input.contactPhone,
            countryId: input.countryId,
            description: input.description,
            status: "pending",
          })
        )
        .returning();
      // The registering user becomes the operator's first staff member so
      // findOperatorForUser resolves immediately, even before approval.
      await tx.insert(schema.operatorUsers).values({ operatorId: operator!.id, userId, title: "Owner" });
      return operator!;
    });
  }

  async review(tenantId: string, operatorId: string, decision: "approved" | "rejected", reviewerUserId: string) {
    const [row] = await this.db
      .update(schema.operators)
      .set({
        status: decision,
        approvedByUserId: decision === "approved" ? reviewerUserId : null,
        approvedAt: decision === "approved" ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(withTenant(schema.operators.tenantId, tenantId, eq(schema.operators.id, operatorId)))
      .returning();
    return row ?? null;
  }

  /**
   * Grants the tour_operator role to every current staff member of
   * an approved operator. Without this, an approved operator's
   * users would still only carry the "customer" role from
   * registration and every operator-gated route (package creation,
   * "/packages/mine", etc.) would 403 forever - approval alone
   * changes the operators.status column but does nothing to RBAC
   * unless this runs too.
   *
   * Note: a user's JWT is only re-issued at login/refresh, so a
   * user who is already logged in when their operator gets
   * approved won't see the new role until their next token
   * refresh - expected RBAC behavior, not a bug in this method.
   */
  async grantOperatorRoleToStaff(operatorId: string) {
    const [tourOperatorRole] = await this.db
      .select()
      .from(schema.roles)
      .where(eq(schema.roles.name, "tour_operator"))
      .limit(1);
    if (!tourOperatorRole) return; // role not seeded - nothing to grant, fail soft rather than block approval

    const staff = await this.listStaff(operatorId);
    for (const member of staff) {
      const existing = await this.db
        .select()
        .from(schema.userRoles)
        .where(and(eq(schema.userRoles.userId, member.userId), eq(schema.userRoles.roleId, tourOperatorRole.id)))
        .limit(1);
      if (existing.length === 0) {
        await this.db.insert(schema.userRoles).values({ userId: member.userId, roleId: tourOperatorRole.id });
      }
    }
  }

  async suspend(tenantId: string, operatorId: string) {
    const [row] = await this.db
      .update(schema.operators)
      .set({ status: "suspended", updatedAt: new Date() })
      .where(withTenant(schema.operators.tenantId, tenantId, eq(schema.operators.id, operatorId)))
      .returning();
    return row ?? null;
  }

  async setCommissionRate(tenantId: string, operatorId: string, percent: number) {
    const [row] = await this.db
      .update(schema.operators)
      .set({ commissionRatePercent: percent.toFixed(2), updatedAt: new Date() })
      .where(withTenant(schema.operators.tenantId, tenantId, eq(schema.operators.id, operatorId)))
      .returning();
    return row ?? null;
  }

  async addStaff(operatorId: string, userId: string, title?: string) {
    const [row] = await this.db.insert(schema.operatorUsers).values({ operatorId, userId, title }).returning();
    return row!;
  }

  async listStaff(operatorId: string) {
    return this.db.select().from(schema.operatorUsers).where(eq(schema.operatorUsers.operatorId, operatorId));
  }

  async addDocument(operatorId: string, documentType: string, storageKey: string) {
    const [row] = await this.db
      .insert(schema.operatorDocuments)
      .values({ operatorId, documentType, storageKey, status: "pending" })
      .returning();
    return row!;
  }

  async listDocuments(operatorId: string) {
    return this.db.select().from(schema.operatorDocuments).where(eq(schema.operatorDocuments.operatorId, operatorId));
  }

  async reviewDocument(tenantId: string, documentId: string, decision: "approved" | "rejected", reviewerUserId: string) {
    const [row] = await this.db
      .update(schema.operatorDocuments)
      .set({ status: decision, reviewedByUserId: reviewerUserId, updatedAt: new Date() })
      .where(
        and(
          eq(schema.operatorDocuments.id, documentId),
          // operatorDocuments has no tenant_id of its own (child of
          // operators) - this subquery is the tenant check, so a
          // tenant-A admin can't approve/reject tenant-B's document by
          // guessing its id.
          sql`${schema.operatorDocuments.operatorId} IN (SELECT id FROM ${schema.operators} WHERE ${schema.operators.tenantId} = ${tenantId})`
        )
      )
      .returning();
    return row ?? null;
  }
}
