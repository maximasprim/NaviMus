import { and, desc, eq, schema, scopedInsert, withTenant, type Database } from "@travel/database";

export type FavoriteSubjectType = "destination" | "package" | "accommodation";

/**
 * Section 30 (customer dashboard: wishlist) / section 6 (favorites,
 * wishlists tables). `subjectType`/`subjectId` is a loose polymorphic
 * reference rather than three separate FK columns - same tradeoff the
 * schema itself already made when the table was defined (no FK
 * enforcement to destinations/packages/accommodations, so a stale
 * favorite for a deleted subject is possible; the frontend is
 * expected to tolerate a 404 when resolving a favorited item, same as
 * any soft-deleted subject elsewhere in this codebase).
 */
export class FavoriteRepository {
  constructor(private readonly db: Database) {}

  async add(tenantId: string, userId: string, subjectType: FavoriteSubjectType, subjectId: string) {
    // ON CONFLICT DO NOTHING against the (user, subjectType, subjectId)
    // unique index - favoriting something twice is a no-op, not an error.
    await this.db
      .insert(schema.favorites)
      .values(scopedInsert(tenantId, { userId, subjectType, subjectId }))
      .onConflictDoNothing();
  }

  async remove(tenantId: string, userId: string, subjectType: FavoriteSubjectType, subjectId: string) {
    await this.db
      .delete(schema.favorites)
      .where(
        withTenant(
          schema.favorites.tenantId,
          tenantId,
          eq(schema.favorites.userId, userId),
          eq(schema.favorites.subjectType, subjectType),
          eq(schema.favorites.subjectId, subjectId)
        )
      );
  }

  async listForUser(tenantId: string, userId: string) {
    return this.db
      .select()
      .from(schema.favorites)
      .where(withTenant(schema.favorites.tenantId, tenantId, eq(schema.favorites.userId, userId)))
      .orderBy(desc(schema.favorites.createdAt));
  }
}
