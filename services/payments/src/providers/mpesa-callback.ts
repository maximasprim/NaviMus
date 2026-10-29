import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Pure helpers for authenticating Daraja callbacks. Kept free of config
 * and network access so they can be unit tested directly.
 *
 * Why this exists: Daraja does not sign its callbacks. Without something
 * here, anyone who learns (or guesses) a CheckoutRequestID can POST a
 * "paid" callback and confirm a booking. We therefore hand Safaricom a
 * callback URL that embeds an HMAC of the specific payment id, so:
 *   - only someone who knows MPESA_CALLBACK_SECRET can mint a valid URL;
 *   - a URL that leaks (logs, proxies) is valid for ONE payment only.
 */

export function signCallbackPath(secret: string, paymentId: string): string {
  return createHmac("sha256", secret).update(`mpesa-callback:${paymentId}`).digest("hex");
}

/**
 * Reversal (refund) callbacks are signed under a DIFFERENT domain-separation
 * prefix than payment callbacks, so a signed payment-callback URL can never
 * be replayed as a refund-result URL (or vice versa) even if a UUID is reused.
 */
export function signReversalPath(secret: string, refundId: string): string {
  return createHmac("sha256", secret).update(`mpesa-reversal:${refundId}`).digest("hex");
}

export function verifyReversalSignature(secret: string, refundId: string, signature: string): boolean {
  const expected = Buffer.from(signReversalPath(secret, refundId), "utf8");
  const given = Buffer.from(signature, "utf8");
  if (expected.length !== given.length) return false;
  return timingSafeEqual(expected, given);
}

export function verifyCallbackSignature(secret: string, paymentId: string, signature: string): boolean {
  const expected = Buffer.from(signCallbackPath(secret, paymentId), "utf8");
  const given = Buffer.from(signature, "utf8");
  // timingSafeEqual throws on length mismatch - that alone isn't secret.
  if (expected.length !== given.length) return false;
  return timingSafeEqual(expected, given);
}

export function parseIpAllowlist(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Empty allowlist = check disabled. Otherwise the caller IP must be listed exactly. */
export function isIpAllowed(allowlist: string[], clientIp: string | undefined): boolean {
  if (allowlist.length === 0) return true;
  if (!clientIp) return false;
  return allowlist.includes(clientIp);
}

/**
 * X-Forwarded-For is only trustworthy when set by a proxy you control;
 * we take the left-most entry, as proxies append. Document this wherever
 * the allowlist is configured.
 */
export function clientIpFromHeaders(headers: Record<string, string | undefined>): string | undefined {
  const xff = headers["x-forwarded-for"];
  if (xff) return xff.split(",")[0]?.trim() || undefined;
  return headers["x-real-ip"]?.trim() || undefined;
}

export interface ParsedStkCallback {
  checkoutRequestId: string;
  merchantRequestId: string;
  resultCode: number;
  amount: number;
  receiptNumber?: string;
}

/** Throws on anything that isn't the documented STK callback shape. */
export function parseStkCallback(payload: any): ParsedStkCallback {
  const cb = payload?.Body?.stkCallback;
  if (!cb || typeof cb.CheckoutRequestID !== "string" || !cb.CheckoutRequestID) {
    throw new Error("Unrecognized M-Pesa callback shape");
  }
  const resultCode = Number(cb.ResultCode);
  if (!Number.isFinite(resultCode)) throw new Error("M-Pesa callback missing ResultCode");
  const items: Array<{ Name: string; Value: unknown }> = cb.CallbackMetadata?.Item ?? [];
  const find = (name: string) => items.find((i) => i.Name === name)?.Value;
  return {
    checkoutRequestId: cb.CheckoutRequestID,
    merchantRequestId: String(cb.MerchantRequestID ?? ""),
    resultCode,
    amount: Number(find("Amount") ?? 0),
    receiptNumber: find("MpesaReceiptNumber") ? String(find("MpesaReceiptNumber")) : undefined,
  };
}

export interface ParsedReversalResult {
  resultCode: number;
  resultDesc: string;
  originatorConversationId: string;
  conversationId: string;
  transactionId?: string;
  amount?: number;
}

/** Parses Daraja's async Result payload for a Transaction Reversal. Throws on anything else. */
export function parseReversalResult(payload: any): ParsedReversalResult {
  const r = payload?.Result;
  if (!r || typeof r.OriginatorConversationID !== "string") throw new Error("Unrecognized M-Pesa reversal result shape");
  const resultCode = Number(r.ResultCode);
  if (!Number.isFinite(resultCode)) throw new Error("M-Pesa reversal result missing ResultCode");
  const params: Array<{ Key: string; Value: unknown }> = r.ResultParameters?.ResultParameter ?? [];
  const amount = params.find((p) => p.Key === "Amount")?.Value;
  return {
    resultCode,
    resultDesc: String(r.ResultDesc ?? ""),
    originatorConversationId: r.OriginatorConversationID,
    conversationId: String(r.ConversationID ?? ""),
    transactionId: r.TransactionID ? String(r.TransactionID) : undefined,
    amount: amount !== undefined ? Number(amount) : undefined,
  };
}
