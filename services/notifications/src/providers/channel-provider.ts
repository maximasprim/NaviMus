/**
 * Every notification channel (email, SMS, WhatsApp) implements
 * this. NotificationService depends only on this interface, so a
 * provider swap (e.g. SendGrid -> Resend) never touches template
 * resolution or the queue consumer.
 */
export interface SendResult {
  providerReference?: string;
  raw?: unknown;
}

export interface ChannelProvider {
  readonly channel: "email" | "sms" | "whatsapp";
  send(to: string, subject: string | undefined, body: string): Promise<SendResult>;
}
