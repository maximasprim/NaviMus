import { createServiceLogger } from "@travel/logger";
import type { ChannelProvider, SendResult } from "./channel-provider.js";

const logger = createServiceLogger("notification-mock-provider");

/**
 * Dev/mock implementation used when EMAIL_PROVIDER / SMS_PROVIDER /
 * WHATSAPP_PROVIDER is "mock" (the default). Logs instead of
 * sending, so local development and CI never accidentally message
 * a real customer. Never used in production - see the real
 * provider selection in provider-factory.ts.
 */
export class MockEmailProvider implements ChannelProvider {
  readonly channel = "email" as const;
  async send(to: string, subject: string | undefined, body: string): Promise<SendResult> {
    logger.info({ to, subject, bodyPreview: body.slice(0, 200) }, "[mock] would send email");
    return { providerReference: `mock-email-${Date.now()}` };
  }
}

export class MockSmsProvider implements ChannelProvider {
  readonly channel = "sms" as const;
  async send(to: string, _subject: string | undefined, body: string): Promise<SendResult> {
    logger.info({ to, bodyPreview: body.slice(0, 200) }, "[mock] would send SMS");
    return { providerReference: `mock-sms-${Date.now()}` };
  }
}

export class MockWhatsAppProvider implements ChannelProvider {
  readonly channel = "whatsapp" as const;
  async send(to: string, _subject: string | undefined, body: string): Promise<SendResult> {
    logger.info({ to, bodyPreview: body.slice(0, 200) }, "[mock] would send WhatsApp message");
    return { providerReference: `mock-whatsapp-${Date.now()}` };
  }
}
