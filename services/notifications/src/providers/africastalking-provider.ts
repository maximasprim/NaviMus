import { env } from "@travel/config";
import { ExternalServiceError, PaymentError } from "@travel/types";
import type { ChannelProvider, SendResult } from "./channel-provider.js";

export class AfricasTalkingSmsProvider implements ChannelProvider {
  readonly channel = "sms" as const;

  async send(to: string, _subject: string | undefined, body: string): Promise<SendResult> {
    if (!env.SMS_API_KEY) {
      throw new PaymentError("SMS_API_KEY is not configured for the africastalking provider");
    }
    const res = await fetch("https://api.africastalking.com/version1/messaging", {
      method: "POST",
      headers: {
        apiKey: env.SMS_API_KEY,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({ to, message: body }).toString(),
    });
    if (!res.ok) {
      throw new ExternalServiceError("Africa's Talking", `SMS send failed (${res.status})`);
    }
    const data = await res.json();
    return { raw: data };
  }
}
