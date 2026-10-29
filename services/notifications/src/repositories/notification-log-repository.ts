import { and, desc, eq, isNull, schema, scopedInsert, sql, type Database } from "@travel/database";

export class NotificationLogRepository {
  constructor(private readonly db: Database) {}

  async create(input: {
    tenantId: string;
    userId?: string;
    templateKey: string;
    channel: string;
    recipient: string;
    status: "queued" | "sent" | "delivered" | "failed";
    providerReference?: string;
    errorMessage?: string;
  }) {
    const [row] = await this.db
      .insert(schema.notificationLogs)
      .values(scopedInsert(input.tenantId, {
        userId: input.userId,
        templateKey: input.templateKey,
        channel: input.channel,
        recipient: input.recipient,
        status: input.status,
        providerReference: input.providerReference,
        errorMessage: input.errorMessage,
        sentAt: input.status === "sent" ? new Date() : undefined,
      }))
      .returning();
    return row!;
  }

  async markStatus(id: string, status: "sent" | "delivered" | "failed", errorMessage?: string) {
    await this.db
      .update(schema.notificationLogs)
      .set({ status, errorMessage, sentAt: status === "sent" ? new Date() : undefined })
      .where(eq(schema.notificationLogs.id, id));
  }

  /**
   * Powers the customer dashboard's notification inbox. Deliberately
   * NOT filtered by channel - a user's inbox reasonably includes every
   * notification sent to them (email/sms/whatsapp/in_app alike), so
   * they have one place to review "everything we've told you", not
   * just messages sent to a channel that happens to be labelled
   * "in_app".
   *
   * No separate tenantId filter needed: notification_logs has no
   * tenant_id column of its own (child of users, per the Phase 1
   * schema decision), and `userId` here is always the caller's own id
   * from their JWT - which is itself bound to exactly one tenant - so
   * this can never read another tenant's notifications.
   */
  async listForUser(userId: string, page: number, pageSize: number) {
    const offset = (page - 1) * pageSize;
    const [items, countRows, unreadRows] = await Promise.all([
      this.db
        .select()
        .from(schema.notificationLogs)
        .where(eq(schema.notificationLogs.userId, userId))
        .orderBy(desc(schema.notificationLogs.createdAt))
        .limit(pageSize)
        .offset(offset),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.notificationLogs)
        .where(eq(schema.notificationLogs.userId, userId)),
      this.db
        .select({ unread: sql<number>`count(*)::int` })
        .from(schema.notificationLogs)
        .where(and(eq(schema.notificationLogs.userId, userId), isNull(schema.notificationLogs.readAt))),
    ]);
    return { items, total: countRows[0]?.count ?? 0, unreadCount: unreadRows[0]?.unread ?? 0 };
  }

  async markRead(id: string, userId: string) {
    await this.db
      .update(schema.notificationLogs)
      .set({ readAt: new Date() })
      .where(and(eq(schema.notificationLogs.id, id), eq(schema.notificationLogs.userId, userId)));
  }

  async markAllRead(userId: string) {
    await this.db
      .update(schema.notificationLogs)
      .set({ readAt: new Date() })
      .where(and(eq(schema.notificationLogs.userId, userId), isNull(schema.notificationLogs.readAt)));
  }
}
