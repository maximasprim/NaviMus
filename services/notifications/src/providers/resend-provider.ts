import { env } from "@travel/config";
import { ExternalServiceError, PaymentError } from "@travel/types";
import type { ChannelProvider, SendResult } from "./channel-provider.js";

export class ResendEmailProvider implements ChannelProvider {
  readonly channel = "email" as const;

  async send(to: string, subject: string | undefined, body: string): Promise<SendResult> {
    if (!env.EMAIL_API_KEY) {
      throw new PaymentError("EMAIL_API_KEY is not configured for the resend provider");
    }
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.EMAIL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to,
        subject: subject ?? "Notification",
        html: body,
      }),
    });
    if (!res.ok) {
      throw new ExternalServiceError("Resend", `Email send failed (${res.status})`);
    }
    const data = (await res.json()) as { id: string };
    return { providerReference: data.id, raw: data };
  }
}
