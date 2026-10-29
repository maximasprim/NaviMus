import { and, eq, isNull, schema, type Database } from "@travel/database";

const DEFAULT_PLATFORM_COMMISSION_PERCENT = 10;

/**
 * Thin wrapper over system_settings for the handful of values the
 * Payment service needs. Never hardcode the commission percentage
 * in business logic - always resolve it here so admins can change
 * it via /api/v1/admin without a deploy.
 */
export class SettingsRepository {
  constructor(private readonly db: Database) {}

  /**
   * Tenant override first, falling back to the platform-wide default row
   * (tenant_id IS NULL) - see the schema comment on system_settings for
   * why this needs two lookups rather than one composite-unique row: a
   * tenant that has never set its own commission rate should still get
   * you (the super_admin)'s platform default, not a hardcoded literal.
   */
  async getPlatformCommissionPercent(tenantId: string): Promise<number> {
    const [tenantRow] = await this.db
      .select()
      .from(schema.systemSettings)
      .where(and(eq(schema.systemSettings.tenantId, tenantId), eq(schema.systemSettings.key, "platform_commission_percent")))
      .limit(1);
    if (tenantRow) {
      const value = Number(tenantRow.value);
      if (Number.isFinite(value)) return value;
    }

    const [defaultRow] = await this.db
      .select()
      .from(schema.systemSettings)
      .where(and(isNull(schema.systemSettings.tenantId), eq(schema.systemSettings.key, "platform_commission_percent")))
      .limit(1);
    if (!defaultRow) return DEFAULT_PLATFORM_COMMISSION_PERCENT;
    const value = Number(defaultRow.value);
    return Number.isFinite(value) ? value : DEFAULT_PLATFORM_COMMISSION_PERCENT;
  }
}
