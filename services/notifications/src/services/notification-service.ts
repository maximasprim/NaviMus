import { createServiceLogger } from "@travel/logger";
import { getProviderForChannel } from "../providers/index.js";
import { renderTemplate, type TemplateRepository } from "../templates.js";
import type { NotificationLogRepository } from "../repositories/notification-log-repository.js";

const logger = createServiceLogger("notification-service");

export interface NotifyInput {
  tenantId: string;
  templateKey: string;
  channel: "email" | "sms" | "whatsapp";
  recipient: string; // email address or phone number
  userId?: string;
  variables: Record<string, string | number>;
  locale?: string;
}

export class NotificationService {
  constructor(
    private readonly templates: TemplateRepository,
    private readonly logs: NotificationLogRepository
  ) {}

  /**
   * Renders and sends one notification, logging the outcome
   * either way. Failures are caught and logged rather than thrown
   * - a broken email template should never crash the BullMQ
   * worker or block other queued notifications.
   */
  async notify(input: NotifyInput): Promise<void> {
    const template = await this.templates.find(input.tenantId, input.templateKey, input.channel, input.locale ?? "en");
    if (!template) {
      logger.warn(
        { templateKey: input.templateKey, channel: input.channel },
        "No notification template configured - skipping send"
      );
      await this.logs.create({
        tenantId: input.tenantId,
        userId: input.userId,
        templateKey: input.templateKey,
        channel: input.channel,
        recipient: input.recipient,
        status: "failed",
        errorMessage: "No template configured",
      });
      return;
    }

    const subject = template.subject ? renderTemplate(template.subject, input.variables) : undefined;
    const body = renderTemplate(template.bodyTemplate, input.variables);

    const logRow = await this.logs.create({
      tenantId: input.tenantId,
      userId: input.userId,
      templateKey: input.templateKey,
      channel: input.channel,
      recipient: input.recipient,
      status: "queued",
    });

    try {
      const provider = getProviderForChannel(input.channel);
      const result = await provider.send(input.recipient, subject, body);
      await this.logs.markStatus(logRow.id, "sent");
      logger.info(
        { channel: input.channel, recipient: input.recipient, templateKey: input.templateKey, providerReference: result.providerReference },
        "Notification sent"
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      await this.logs.markStatus(logRow.id, "failed", message);
      logger.error({ err, channel: input.channel, templateKey: input.templateKey }, "Notification send failed");
    }
  }
}
