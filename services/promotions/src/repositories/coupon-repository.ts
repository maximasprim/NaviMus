import { eq, schema, sql, withTenant, scopedInsert, type Database } from "@travel/database";
import type { CreateCouponInput } from "@travel/validation";

export class CouponRepository {
  constructor(private readonly db: Database) {}

  /** Tenant-scoped so "SAVE10" from one tenant can't be redeemed against a different tenant's booking. */
  async findByCode(tenantId: string, code: string) {
    const [row] = await this.db
      .select()
      .from(schema.coupons)
      .where(withTenant(schema.coupons.tenantId, tenantId, eq(schema.coupons.code, code)))
      .limit(1);
    return row ?? null;
  }

  async create(tenantId: string, input: CreateCouponInput) {
    const [row] = await this.db
      .insert(schema.coupons)
      .values(
        scopedInsert(tenantId, {
          code: input.code.toUpperCase(),
          operatorId: input.operatorId,
          discountType: input.discountType,
          discountValue: input.discountValue.toFixed(2),
          currency: input.currency,
          maxUses: input.maxUses,
          minBookingAmount: input.minBookingAmount?.toFixed(2),
          validFrom: input.validFrom,
          validUntil: input.validUntil,
        })
      )
      .returning();
    return row!;
  }

  /**
   * Atomically increments usedCount only if it's still below
   * maxUses (or maxUses is null = unlimited), so two concurrent
   * redemptions of the last remaining use can't both succeed.
   * Returns true if the redemption was accepted.
   */
  async tryRedeem(tx: Database, couponId: string): Promise<boolean> {
    const result = await tx.execute(sql`
      UPDATE coupons
      SET used_count = used_count + 1
      WHERE id = ${couponId}
        AND is_active = true
        AND (max_uses IS NULL OR used_count < max_uses)
      RETURNING id
    `);
    const rows = result as unknown as Array<{ id: string }>;
    return rows.length > 0;
  }
}
