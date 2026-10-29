import { createHash } from "node:crypto";
import { env } from "@travel/config";
import { AuthenticationError, AuthorizationError, ExternalServiceError, PaymentError, ValidationError } from "@travel/types";
import { createServiceLogger } from "@travel/logger";
import type {
  CreateIntentParams,
  CreateIntentResult,
  PaymentProvider,
  RefundParams,
  RefundResult,
  VerifiedWebhookEvent,
  WebhookContext,
} from "./payment-provider.js";
import {
  isIpAllowed,
  parseIpAllowlist,
  parseReversalResult,
  parseStkCallback,
  signCallbackPath,
  signReversalPath,
  verifyCallbackSignature,
  verifyReversalSignature,
} from "./mpesa-callback.js";

const logger = createServiceLogger("mpesa-provider");

/**
 * Everything the provider reads from the environment, injectable so
 * tests can exercise the real verification logic without booting config.
 */
export interface MpesaConfig {
  env: "sandbox" | "production";
  consumerKey?: string;
  consumerSecret?: string;
  shortcode?: string;
  passkey?: string;
  publicApiUrl?: string;
  callbackSecret?: string;
  callbackIpAllowlist?: string;
  verifyWithQuery: boolean;
  initiatorName?: string;
  securityCredential?: string;
}

export type ReversalCallbackKind = "result" | "timeout";

export interface VerifiedReversalCallback {
  refundId: string;
  /** TIMEOUT means "Safaricom didn't answer in time" - the money may or may not have moved. */
  outcome: "SUCCEEDED" | "FAILED" | "TIMEOUT";
  originatorConversationId?: string;
  amount?: number;
  description: string;
  raw: unknown;
}

function configFromEnv(): MpesaConfig {
  return {
    env: env.MPESA_ENV,
    consumerKey: env.MPESA_CONSUMER_KEY,
    consumerSecret: env.MPESA_CONSUMER_SECRET,
    shortcode: env.MPESA_SHORTCODE,
    passkey: env.MPESA_PASSKEY,
    publicApiUrl: env.PUBLIC_API_URL,
    callbackSecret: env.MPESA_CALLBACK_SECRET,
    callbackIpAllowlist: env.MPESA_CALLBACK_IP_ALLOWLIST,
    verifyWithQuery: env.MPESA_VERIFY_WITH_QUERY,
    initiatorName: env.MPESA_INITIATOR_NAME,
    securityCredential: env.MPESA_SECURITY_CREDENTIAL,
  };
}

interface DarajaAccessTokenResponse {
  access_token: string;
  expires_in: string;
}

interface DarajaStkPushResponse {
  MerchantRequestID: string;
  CheckoutRequestID: string;
  ResponseCode: string;
  ResponseDescription: string;
  CustomerMessage: string;
}

/** Normalizes "+254712345678" / "0712345678" / "254712345678" to Daraja's expected 2547XXXXXXXX format. */
function toMsisdn(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("254")) return digits;
  if (digits.startsWith("0")) return `254${digits.slice(1)}`;
  if (digits.startsWith("7") || digits.startsWith("1")) return `254${digits}`;
  return digits;
}

export class MpesaProvider implements PaymentProvider {
  readonly name = "mpesa" as const;
  // STK Push only ever collects Kenyan shillings.
  readonly supportedCurrencies = ["KES"] as const;
  // We send Math.round(amount) to Daraja, so the callback can differ from
  // the stored amount by up to half a shilling.
  readonly amountTolerance = 0.5;

  constructor(
    private readonly cfg: MpesaConfig = configFromEnv(),
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  private get baseUrl(): string {
    return this.cfg.env === "production" ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke";
  }

  private async getAccessToken(): Promise<string> {
    if (!this.cfg.consumerKey || !this.cfg.consumerSecret) {
      throw new PaymentError("M-Pesa is not configured on this environment");
    }
    const credentials = Buffer.from(`${this.cfg.consumerKey}:${this.cfg.consumerSecret}`).toString("base64");

    const res = await this.fetchImpl(`${this.baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
      headers: { Authorization: `Basic ${credentials}` },
    });
    if (!res.ok) {
      throw new ExternalServiceError("M-Pesa", `Failed to obtain access token (${res.status})`);
    }
    const data = (await res.json()) as DarajaAccessTokenResponse;
    return data.access_token;
  }

  private stkCredentials(): { timestamp: string; password: string } {
    if (!this.cfg.shortcode || !this.cfg.passkey) {
      throw new PaymentError("M-Pesa is not configured on this environment");
    }
    const timestamp = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14);
    const password = Buffer.from(`${this.cfg.shortcode}${this.cfg.passkey}${timestamp}`).toString("base64");
    return { timestamp, password };
  }

  /**
   * Builds the per-payment callback URL Safaricom will POST to. The HMAC
   * segment is what authenticates the callback (see mpesa-callback.ts).
   * Fails closed: no public URL or secret = no STK push, rather than
   * silently registering a URL nothing can ever reach (the previous
   * behaviour: hardcoded example domains) or an unauthenticated one.
   */
  buildCallbackUrl(paymentId: string): string {
    if (!this.cfg.publicApiUrl || !this.cfg.callbackSecret) {
      throw new PaymentError("M-Pesa callbacks are not configured (PUBLIC_API_URL / MPESA_CALLBACK_SECRET)");
    }
    const base = this.cfg.publicApiUrl.replace(/\/+$/, "");
    // Path avoids "mpesa"/"safaricom" - Daraja rejects callback URLs containing such keywords.
    return `${base}/api/v1/payments/webhooks/stk/${paymentId}/${signCallbackPath(this.cfg.callbackSecret, paymentId)}`;
  }

  async createIntent(params: CreateIntentParams): Promise<CreateIntentResult> {
    if (!params.phoneNumber) {
      throw new PaymentError("A phone number is required for M-Pesa payments");
    }
    if (params.currency !== "KES") {
      // Defence in depth - PaymentService checks supportedCurrencies first.
      throw new PaymentError(`M-Pesa can only collect KES, not ${params.currency}`);
    }
    const callbackUrl = this.buildCallbackUrl(params.paymentId);
    const { timestamp, password } = this.stkCredentials();
    const accessToken = await this.getAccessToken();
    const msisdn = toMsisdn(params.phoneNumber);

    const res = await this.fetchImpl(`${this.baseUrl}/mpesa/stkpush/v1/processrequest`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        BusinessShortCode: this.cfg.shortcode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: "CustomerPayBillOnline",
        Amount: Math.round(params.amount), // M-Pesa requires whole KES amounts
        PartyA: msisdn,
        PartyB: this.cfg.shortcode,
        PhoneNumber: msisdn,
        CallBackURL: callbackUrl,
        AccountReference: params.bookingId,
        TransactionDesc: params.description,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      logger.error({ status: res.status, body }, "M-Pesa STK push failed");
      throw new ExternalServiceError("M-Pesa", `STK push request failed (${res.status})`);
    }

    const data = (await res.json()) as DarajaStkPushResponse;
    if (data.ResponseCode !== "0") {
      throw new PaymentError(data.ResponseDescription || "M-Pesa rejected the payment request");
    }

    return {
      providerReference: data.CheckoutRequestID,
      status: "PENDING",
      raw: data,
    };
  }

  /**
   * Asks Daraja directly whether this STK request succeeded. A forged
   * callback can claim anything; it cannot make Safaricom's own API
   * agree. Throws unless Daraja positively reports ResultCode 0.
   */
  private async confirmWithStkQuery(checkoutRequestId: string): Promise<void> {
    const { timestamp, password } = this.stkCredentials();
    const accessToken = await this.getAccessToken();
    const res = await this.fetchImpl(`${this.baseUrl}/mpesa/stkpushquery/v1/query`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        BusinessShortCode: this.cfg.shortcode,
        Password: password,
        Timestamp: timestamp,
        CheckoutRequestID: checkoutRequestId,
      }),
    });
    if (!res.ok) {
      // Includes Daraja's "transaction is being processed" error - not
      // proof of anything either way, so we must not credit on it.
      throw new ExternalServiceError("M-Pesa", `STK query failed (${res.status}); payment not confirmed`);
    }
    const data = (await res.json()) as { ResultCode?: string | number };
    if (String(data.ResultCode) !== "0") {
      logger.error({ checkoutRequestId, resultCode: data.ResultCode }, "M-Pesa callback claimed success but Daraja query disagrees");
      throw new AuthorizationError("M-Pesa payment could not be confirmed with the provider");
    }
  }

  /**
   * Authenticates, then parses, an M-Pesa callback. Three independent
   * checks, in order of cheapness:
   *   1. the per-payment HMAC in the callback URL (proves it came via a
   *      URL only we could have issued),
   *   2. optional source-IP allowlist,
   *   3. for "paid" callbacks, a server-to-server STK query.
   * Runs BEFORE anything is written to the database, so unauthenticated
   * requests cannot even create payment_webhooks rows.
   */
  async verifyWebhook(
    rawBody: string,
    _headers: Record<string, string | undefined>,
    ctx: WebhookContext = {}
  ): Promise<VerifiedWebhookEvent> {
    if (!this.cfg.callbackSecret) {
      throw new PaymentError("M-Pesa callbacks are not configured on this environment");
    }
    if (!ctx.paymentId || !ctx.signature || !verifyCallbackSignature(this.cfg.callbackSecret, ctx.paymentId, ctx.signature)) {
      throw new AuthenticationError("Invalid M-Pesa callback signature");
    }
    if (!isIpAllowed(parseIpAllowlist(this.cfg.callbackIpAllowlist), ctx.clientIp)) {
      logger.warn({ clientIp: ctx.clientIp }, "M-Pesa callback from non-allowlisted IP rejected");
      throw new AuthorizationError("Callback source not permitted");
    }

    let parsed;
    try {
      parsed = parseStkCallback(JSON.parse(rawBody));
    } catch (err) {
      throw new PaymentError(err instanceof Error ? err.message : "Malformed M-Pesa callback payload");
    }

    const eventId = createHash("sha256")
      .update(`${parsed.checkoutRequestId}:${parsed.merchantRequestId}:${parsed.resultCode}`)
      .digest("hex");
    const base = {
      eventId,
      providerReference: parsed.checkoutRequestId,
      currency: "KES",
      expectedPaymentId: ctx.paymentId,
      raw: JSON.parse(rawBody),
    };

    if (parsed.resultCode !== 0) {
      return { ...base, outcome: parsed.resultCode === 1032 ? "CANCELLED" : "FAILED", amount: 0 };
    }

    if (this.cfg.verifyWithQuery) {
      await this.confirmWithStkQuery(parsed.checkoutRequestId);
    }

    return { ...base, outcome: "PAID", amount: parsed.amount, providerReceipt: parsed.receiptNumber };
  }

  private reversalUrls(refundId: string) {
    if (!this.cfg.publicApiUrl || !this.cfg.callbackSecret) {
      throw new PaymentError("M-Pesa callbacks are not configured (PUBLIC_API_URL / MPESA_CALLBACK_SECRET)");
    }
    const base = this.cfg.publicApiUrl.replace(/\/+$/, "");
    const sig = signReversalPath(this.cfg.callbackSecret, refundId);
    // Paths avoid "mpesa"/"safaricom": Daraja rejects URLs containing brand keywords.
    return {
      resultUrl: `${base}/api/v1/payments/webhooks/reversal/${refundId}/${sig}`,
      timeoutUrl: `${base}/api/v1/payments/webhooks/reversal-timeout/${refundId}/${sig}`,
    };
  }

  /**
   * Refunds via Daraja's Transaction Reversal API. Asynchronous: Daraja only
   * ACCEPTS the request here; whether the money actually moved arrives later
   * on the signed result callback, so this returns REFUND_PENDING - never
   * REFUNDED. Fails loudly (and leaves nothing half-done) when the
   * initiator credentials aren't configured, rather than pretending.
   *
   * Reversals are keyed by the ORIGINAL transaction's M-Pesa receipt number
   * and are treated here as full-amount only: refusing a partial is safer
   * than a reversal of an amount Safaricom may not honour.
   *
   * NOTE: written from Daraja's published API and unit-tested against a fake;
   * it has NOT been exercised against the Daraja sandbox. Run one sandbox
   * reversal before enabling in production.
   */
  async refund(params: RefundParams): Promise<RefundResult> {
    if (!this.cfg.initiatorName || !this.cfg.securityCredential || !this.cfg.shortcode) {
      throw new ExternalServiceError(
        "M-Pesa",
        "Automated M-Pesa refunds are not configured (MPESA_INITIATOR_NAME / MPESA_SECURITY_CREDENTIAL) - refund this payment manually via the Safaricom portal"
      );
    }
    if (!params.refundId) throw new PaymentError("A refund id is required to address the M-Pesa reversal callback");
    if (!params.providerReceipt) {
      throw new ExternalServiceError(
        "M-Pesa",
        "The M-Pesa receipt number was not recorded for this payment (it predates receipt tracking) - refund it manually via the Safaricom portal"
      );
    }
    if (params.currency !== "KES") throw new PaymentError(`M-Pesa can only refund KES, not ${params.currency}`);
    if (params.originalAmount !== undefined && Math.abs(params.amount - params.originalAmount) > this.amountTolerance) {
      throw new ValidationError("M-Pesa reversals are full-amount only. Refund the full payment, or refund the partial amount manually.");
    }

    const { resultUrl, timeoutUrl } = this.reversalUrls(params.refundId);
    const accessToken = await this.getAccessToken();
    const res = await this.fetchImpl(`${this.baseUrl}/mpesa/reversal/v1/request`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        Initiator: this.cfg.initiatorName,
        SecurityCredential: this.cfg.securityCredential,
        CommandID: "TransactionReversal",
        TransactionID: params.providerReceipt,
        Amount: Math.round(params.amount),
        ReceiverParty: this.cfg.shortcode,
        RecieverIdentifierType: "11", // sic - Daraja's own spelling of this field
        ResultURL: resultUrl,
        QueueTimeOutURL: timeoutUrl,
        Remarks: (params.reason ?? "Refund").slice(0, 100),
        Occasion: params.refundId,
      }),
    });
    if (!res.ok) {
      logger.error({ status: res.status, body: await res.text() }, "M-Pesa reversal request failed");
      throw new ExternalServiceError("M-Pesa", `Reversal request failed (${res.status})`);
    }
    const data = (await res.json()) as { ResponseCode?: string; ResponseDescription?: string; OriginatorConversationID?: string };
    if (data.ResponseCode !== "0" || !data.OriginatorConversationID) {
      throw new PaymentError(data.ResponseDescription || "M-Pesa rejected the reversal request");
    }
    return { providerReference: data.OriginatorConversationID, status: "REFUND_PENDING", raw: data };
  }

  /**
   * Authenticates a reversal result/timeout callback (signed URL + optional
   * IP allowlist), then parses it. Daraja offers no query to cross-check a
   * reversal the way STK Query does for payments, so the signed URL is the
   * authenticity guarantee here - keep MPESA_CALLBACK_SECRET secret.
   */
  verifyReversalCallback(
    rawBody: string,
    ctx: { refundId?: string; signature?: string; clientIp?: string; kind: ReversalCallbackKind }
  ): VerifiedReversalCallback {
    if (!this.cfg.callbackSecret) throw new PaymentError("M-Pesa callbacks are not configured on this environment");
    if (!ctx.refundId || !ctx.signature || !verifyReversalSignature(this.cfg.callbackSecret, ctx.refundId, ctx.signature)) {
      throw new AuthenticationError("Invalid M-Pesa reversal callback signature");
    }
    if (!isIpAllowed(parseIpAllowlist(this.cfg.callbackIpAllowlist), ctx.clientIp)) {
      logger.warn({ clientIp: ctx.clientIp }, "M-Pesa reversal callback from non-allowlisted IP rejected");
      throw new AuthorizationError("Callback source not permitted");
    }

    let raw: unknown = undefined;
    try {
      raw = JSON.parse(rawBody);
    } catch {
      /* a timeout ping may have no usable body; handled below */
    }

    if (ctx.kind === "timeout") {
      return { refundId: ctx.refundId, outcome: "TIMEOUT", description: "Safaricom reported the reversal request timed out", raw };
    }
    let parsed;
    try {
      parsed = parseReversalResult(raw);
    } catch (err) {
      throw new PaymentError(err instanceof Error ? err.message : "Malformed M-Pesa reversal result");
    }
    return {
      refundId: ctx.refundId,
      outcome: parsed.resultCode === 0 ? "SUCCEEDED" : "FAILED",
      originatorConversationId: parsed.originatorConversationId,
      amount: parsed.amount,
      description: parsed.resultDesc,
      raw,
    };
  }
}
