import { and, asc, desc, eq, schema, type Database } from "@travel/database";

/** Section 30 (customer dashboard: support) / section 44 (admin: support). */
export class SupportTicketRepository {
  constructor(private readonly db: Database) {}

  async create(input: { userId: string; bookingId?: string; subject: string; firstMessage: string }) {
    return this.db.transaction(async (tx) => {
      const [ticket] = await tx
        .insert(schema.supportTickets)
        .values({ userId: input.userId, bookingId: input.bookingId, subject: input.subject })
        .returning();
      await tx.insert(schema.supportMessages).values({
        ticketId: ticket!.id,
        senderUserId: input.userId,
        body: input.firstMessage,
      });
      return ticket!;
    });
  }

  async listForUser(userId: string) {
    return this.db
      .select()
      .from(schema.supportTickets)
      .where(eq(schema.supportTickets.userId, userId))
      .orderBy(desc(schema.supportTickets.createdAt));
  }

  /**
   * Admin-facing: every ticket for the admin's own tenant, optionally
   * filtered by status. Joined through users - support_tickets has no
   * tenant_id column of its own (child of users, per the Phase 1 schema
   * decision) - so this join is what stops a tenant-A admin from seeing
   * tenant-B's support queue. tenantId is null only for a super_admin's
   * cross-tenant view.
   */
  async listAll(tenantId: string | null, status?: string) {
    const conditions = [
      tenantId ? eq(schema.users.tenantId, tenantId) : undefined,
      status ? eq(schema.supportTickets.status, status) : undefined,
    ].filter((c): c is NonNullable<typeof c> => Boolean(c));
    const rows = await this.db
      .select({ ticket: schema.supportTickets })
      .from(schema.supportTickets)
      .innerJoin(schema.users, eq(schema.users.id, schema.supportTickets.userId))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(schema.supportTickets.createdAt));
    return rows.map((r) => r.ticket);
  }

  async findByIdForUser(id: string, userId: string) {
    const [ticket] = await this.db
      .select()
      .from(schema.supportTickets)
      .where(and(eq(schema.supportTickets.id, id), eq(schema.supportTickets.userId, userId)))
      .limit(1);
    return ticket ?? null;
  }

  /**
   * Admin-facing - scoped to the admin's own tenant via the same
   * users join listAll uses, unless tenantId is null (super_admin).
   */
  async findById(tenantId: string | null, id: string) {
    const conditions = [
      eq(schema.supportTickets.id, id),
      tenantId ? eq(schema.users.tenantId, tenantId) : undefined,
    ].filter((c): c is NonNullable<typeof c> => Boolean(c));
    const [row] = await this.db
      .select({ ticket: schema.supportTickets })
      .from(schema.supportTickets)
      .innerJoin(schema.users, eq(schema.users.id, schema.supportTickets.userId))
      .where(and(...conditions))
      .limit(1);
    return row?.ticket ?? null;
  }

  async getMessages(ticketId: string) {
    return this.db
      .select()
      .from(schema.supportMessages)
      .where(eq(schema.supportMessages.ticketId, ticketId))
      .orderBy(asc(schema.supportMessages.createdAt));
  }

  async addMessage(ticketId: string, senderUserId: string, body: string) {
    const [message] = await this.db.insert(schema.supportMessages).values({ ticketId, senderUserId, body }).returning();
    await this.db.update(schema.supportTickets).set({ updatedAt: new Date() }).where(eq(schema.supportTickets.id, ticketId));
    return message;
  }

  /** Callers must confirm tenant ownership via findById first - see routes.ts. */
  async updateStatus(id: string, status: "open" | "in_progress" | "resolved" | "closed") {
    await this.db.update(schema.supportTickets).set({ status, updatedAt: new Date() }).where(eq(schema.supportTickets.id, id));
  }

  /** Callers must confirm tenant ownership via findById first - see routes.ts. */
  async assign(id: string, assignedToUserId: string) {
    await this.db.update(schema.supportTickets).set({ assignedToUserId, updatedAt: new Date() }).where(eq(schema.supportTickets.id, id));
  }
}
