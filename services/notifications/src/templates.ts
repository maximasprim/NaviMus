import { and, eq, schema, type Database } from "@travel/database";
import { DEFAULT_TENANT_ID } from "@travel/database";

export class TemplateRepository {
  constructor(private readonly db: Database) {}

  /**
   * Resolution order: this tenant's own template for (key, channel,
   * locale) -> this tenant's template in English (if locale isn't
   * English) -> the platform default tenant's template, same locale
   * fallback. A tenant that has never customized a given notification
   * still gets a working message via the default tenant's copy, rather
   * than silently failing to notify the customer just because they
   * haven't visited the templates screen yet.
   */
  async find(tenantId: string, key: string, channel: string, locale = "en"): Promise<typeof schema.notificationTemplates.$inferSelect | null> {
    const own = await this.findExact(tenantId, key, channel, locale);
    if (own) return own;

    if (locale !== "en") {
      const ownEnglish = await this.findExact(tenantId, key, channel, "en");
      if (ownEnglish) return ownEnglish;
    }

    if (tenantId !== DEFAULT_TENANT_ID) {
      return this.find(DEFAULT_TENANT_ID, key, channel, locale);
    }

    return null;
  }

  private async findExact(tenantId: string, key: string, channel: string, locale: string) {
    const [template] = await this.db
      .select()
      .from(schema.notificationTemplates)
      .where(
        and(
          eq(schema.notificationTemplates.tenantId, tenantId),
          eq(schema.notificationTemplates.key, key),
          eq(schema.notificationTemplates.channel, channel),
          eq(schema.notificationTemplates.locale, locale)
        )
      )
      .limit(1);
    return template ?? null;
  }
}

/** Interpolates {{variable}} placeholders. Unknown variables are left as-is rather than throwing, so a template typo doesn't block sending. */
export function renderTemplate(template: string, variables: Record<string, string | number>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key) => {
    const value = variables[key];
    return value === undefined ? match : String(value);
  });
}
