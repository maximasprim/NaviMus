import { and, eq, isNull, lt, schema, type Database } from "@travel/database";

export class RefreshTokenRepository {
  constructor(private readonly db: Database) {}

  async insert(row: { id: string; userId: string; family: string; expiresAt: Date }) {
    await this.db.insert(schema.refreshTokens).values(row);
  }

  async findById(id: string) {
    const [row] = await this.db.select().from(schema.refreshTokens).where(eq(schema.refreshTokens.id, id)).limit(1);
    return row ?? null;
  }

  /**
   * Revokes the token only if it is still active, and says whether THIS call
   * did it. A single atomic UPDATE, so of two concurrent refreshes with the
   * same token exactly one wins the rotation.
   */
  async revokeIfActive(id: string): Promise<boolean> {
    const rows = await this.db
      .update(schema.refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(schema.refreshTokens.id, id), isNull(schema.refreshTokens.revokedAt)))
      .returning({ id: schema.refreshTokens.id });
    return rows.length > 0;
  }

  async revokeFamily(family: string) {
    await this.db
      .update(schema.refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(schema.refreshTokens.family, family), isNull(schema.refreshTokens.revokedAt)));
  }

  async revokeAllForUser(userId: string) {
    await this.db
      .update(schema.refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(schema.refreshTokens.userId, userId), isNull(schema.refreshTokens.revokedAt)));
  }

  /** Housekeeping: rows expired for over a day carry no information any more. */
  async deleteExpired() {
    await this.db.delete(schema.refreshTokens).where(lt(schema.refreshTokens.expiresAt, new Date(Date.now() - 86_400_000)));
  }
}
