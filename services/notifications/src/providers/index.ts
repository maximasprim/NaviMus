import { env } from "@travel/config";
import type { ChannelProvider } from "./channel-provider.js";
import { MockEmailProvider, MockSmsProvider, MockWhatsAppProvider } from "./mock-providers.js";
import { ResendEmailProvider } from "./resend-provider.js";
import { AfricasTalkingSmsProvider } from "./africastalking-provider.js";

/**
 * Resolves the configured provider for each channel from env
 * config. Business logic (NotificationService) never imports a
 * concrete provider class directly - only this factory - so
 * adding a new provider (e.g. SendGrid, Twilio WhatsApp) means
 * adding one case here, not touching send logic.
 */
export function getEmailProvider(): ChannelProvider {
  switch (env.EMAIL_PROVIDER) {
    case "resend":
      return new ResendEmailProvider();
    case "sendgrid":
    case "ses":
      // Real implementations follow the same ChannelProvider shape as
      // ResendEmailProvider - not wired up yet since no credentials/SDK
      // choice has been confirmed for these providers.
      throw new Error(`Email provider "${env.EMAIL_PROVIDER}" is not yet implemented`);
    case "mock":
    default:
      return new MockEmailProvider();
  }
}

export function getSmsProvider(): ChannelProvider {
  switch (env.SMS_PROVIDER) {
    case "africastalking":
      return new AfricasTalkingSmsProvider();
    case "twilio":
      throw new Error(`SMS provider "twilio" is not yet implemented`);
    case "mock":
    default:
      return new MockSmsProvider();
  }
}

export function getWhatsAppProvider(): ChannelProvider {
  switch (env.WHATSAPP_PROVIDER) {
    case "twilio":
    case "meta":
      throw new Error(`WhatsApp provider "${env.WHATSAPP_PROVIDER}" is not yet implemented`);
    case "mock":
    default:
      return new MockWhatsAppProvider();
  }
}

export function getProviderForChannel(channel: "email" | "sms" | "whatsapp"): ChannelProvider {
  switch (channel) {
    case "email":
      return getEmailProvider();
    case "sms":
      return getSmsProvider();
    case "whatsapp":
      return getWhatsAppProvider();
  }
}

export * from "./channel-provider.js";
