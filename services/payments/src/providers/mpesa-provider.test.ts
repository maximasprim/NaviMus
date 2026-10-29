import { describe, expect, it, vi } from "vitest";
import { MpesaProvider, type MpesaConfig } from "./mpesa-provider.js";
import { signCallbackPath, isIpAllowed, parseIpAllowlist, clientIpFromHeaders, parseStkCallback } from "./mpesa-callback.js";

const SECRET = "ab".repeat(32);
const PAYMENT = "11111111-1111-1111-1111-111111111111";

const cfg = (over: Partial<MpesaConfig> = {}): MpesaConfig => ({
  env: "sandbox",
  consumerKey: "ck",
  consumerSecret: "cs",
  shortcode: "174379",
  passkey: "pk",
  publicApiUrl: "https://api.example.test/",
  callbackSecret: SECRET,
  callbackIpAllowlist: undefined,
  verifyWithQuery: true,
  ...over,
});

const paidBody = (amount = 1235) =>
  JSON.stringify({
    Body: {
      stkCallback: {
        MerchantRequestID: "m1",
        CheckoutRequestID: "ws_CO_1",
        ResultCode: 0,
        CallbackMetadata: {
          Item: [
            { Name: "Amount", Value: amount },
            { Name: "MpesaReceiptNumber", Value: "QGR7ABC123" },
          ],
        },
      },
    },
  });
const failedBody = (code: number) =>
  JSON.stringify({ Body: { stkCallback: { MerchantRequestID: "m1", CheckoutRequestID: "ws_CO_1", ResultCode: code } } });

/** Fake Daraja: token endpoint + a configurable STK query response. */
function fakeDaraja(queryResult: { ok: boolean; ResultCode?: string }) {
  return vi.fn(async (url: any) => {
    const u = String(url);
    if (u.includes("/oauth/")) return new Response(JSON.stringify({ access_token: "tok", expires_in: "3599" }));
    if (u.includes("/stkpushquery/")) {
      return queryResult.ok
        ? new Response(JSON.stringify({ ResultCode: queryResult.ResultCode }))
        : new Response("being processed", { status: 500 });
    }
    return new Response("{}", { status: 404 });
  }) as unknown as typeof fetch;
}

const goodCtx = { paymentId: PAYMENT, signature: signCallbackPath(SECRET, PAYMENT) };

describe("MpesaProvider.verifyWebhook - authentication", () => {
  it("rejects a callback with no signature", async () => {
    const p = new MpesaProvider(cfg(), fakeDaraja({ ok: true, ResultCode: "0" }));
    await expect(p.verifyWebhook(paidBody(), {}, { paymentId: PAYMENT })).rejects.toThrow(/signature/i);
  });

  it("rejects a forged signature", async () => {
    const p = new MpesaProvider(cfg(), fakeDaraja({ ok: true, ResultCode: "0" }));
    await expect(p.verifyWebhook(paidBody(), {}, { paymentId: PAYMENT, signature: "00".repeat(32) })).rejects.toThrow(/signature/i);
  });

  it("rejects a valid signature replayed against a different payment id", async () => {
    const p = new MpesaProvider(cfg(), fakeDaraja({ ok: true, ResultCode: "0" }));
    await expect(
      p.verifyWebhook(paidBody(), {}, { paymentId: "22222222-2222-2222-2222-222222222222", signature: goodCtx.signature })
    ).rejects.toThrow(/signature/i);
  });

  it("refuses everything when no callback secret is configured (fails closed)", async () => {
    const p = new MpesaProvider(cfg({ callbackSecret: undefined }), fakeDaraja({ ok: true, ResultCode: "0" }));
    await expect(p.verifyWebhook(paidBody(), {}, goodCtx)).rejects.toThrow(/not configured/i);
  });

  it("enforces the IP allowlist when set", async () => {
    const p = new MpesaProvider(cfg({ callbackIpAllowlist: "196.201.214.200, 196.201.214.206" }), fakeDaraja({ ok: true, ResultCode: "0" }));
    await expect(p.verifyWebhook(paidBody(), {}, { ...goodCtx, clientIp: "6.6.6.6" })).rejects.toThrow(/not permitted/i);
    await expect(p.verifyWebhook(paidBody(), {}, { ...goodCtx })).rejects.toThrow(/not permitted/i);
    await expect(p.verifyWebhook(paidBody(), {}, { ...goodCtx, clientIp: "196.201.214.206" })).resolves.toMatchObject({ outcome: "PAID" });
  });
});

describe("MpesaProvider.verifyWebhook - confirmation", () => {
  it("returns PAID with receipt and payment binding once Daraja's own query agrees", async () => {
    const p = new MpesaProvider(cfg(), fakeDaraja({ ok: true, ResultCode: "0" }));
    const ev = await p.verifyWebhook(paidBody(1235), {}, goodCtx);
    expect(ev).toMatchObject({
      outcome: "PAID",
      amount: 1235,
      currency: "KES",
      providerReference: "ws_CO_1",
      providerReceipt: "QGR7ABC123",
      expectedPaymentId: PAYMENT,
    });
  });

  it("refuses to credit when the callback claims success but Daraja says otherwise", async () => {
    const p = new MpesaProvider(cfg(), fakeDaraja({ ok: true, ResultCode: "1032" }));
    await expect(p.verifyWebhook(paidBody(), {}, goodCtx)).rejects.toThrow(/could not be confirmed/i);
  });

  it("refuses to credit when the Daraja query itself fails (no proof either way)", async () => {
    const p = new MpesaProvider(cfg(), fakeDaraja({ ok: false }));
    await expect(p.verifyWebhook(paidBody(), {}, goodCtx)).rejects.toThrow(/not confirmed/i);
  });

  it("skips the query when disabled by config", async () => {
    const f = fakeDaraja({ ok: false });
    const p = new MpesaProvider(cfg({ verifyWithQuery: false }), f);
    await expect(p.verifyWebhook(paidBody(), {}, goodCtx)).resolves.toMatchObject({ outcome: "PAID" });
    expect(f).not.toHaveBeenCalled();
  });

  it("maps failure and user-cancel result codes without calling Daraja", async () => {
    const f = fakeDaraja({ ok: false });
    const p = new MpesaProvider(cfg(), f);
    expect(await p.verifyWebhook(failedBody(1), {}, goodCtx)).toMatchObject({ outcome: "FAILED", amount: 0 });
    expect(await p.verifyWebhook(failedBody(1032), {}, goodCtx)).toMatchObject({ outcome: "CANCELLED" });
    expect(f).not.toHaveBeenCalled();
  });

  it("rejects malformed payloads even when correctly signed", async () => {
    const p = new MpesaProvider(cfg(), fakeDaraja({ ok: true, ResultCode: "0" }));
    await expect(p.verifyWebhook("not json", {}, goodCtx)).rejects.toThrow();
    await expect(p.verifyWebhook("{}", {}, goodCtx)).rejects.toThrow(/shape/i);
  });
});

describe("MpesaProvider.createIntent", () => {
  it("registers a per-payment signed callback URL on the configured public host", async () => {
    const f = vi.fn(async (url: any, init?: any) => {
      if (String(url).includes("/oauth/")) return new Response(JSON.stringify({ access_token: "tok", expires_in: "1" }));
      return new Response(JSON.stringify({ ResponseCode: "0", CheckoutRequestID: "ws_CO_9", MerchantRequestID: "m9" }));
    }) as unknown as typeof fetch;
    const p = new MpesaProvider(cfg(), f);
    const res = await p.createIntent({ paymentId: PAYMENT, bookingId: "b1", amount: 1234.56, currency: "KES", phoneNumber: "0712345678", description: "x" });
    expect(res.providerReference).toBe("ws_CO_9");

    const stkCall = (f as any).mock.calls.find((c: any[]) => String(c[0]).includes("stkpush"));
    const body = JSON.parse(stkCall[1].body);
    expect(body.Amount).toBe(1235);
    expect(body.CallBackURL).toBe(`https://api.example.test/api/v1/payments/webhooks/stk/${PAYMENT}/${signCallbackPath(SECRET, PAYMENT)}`);
    expect(body.CallBackURL).not.toMatch(/mpesa|safaricom/i);
    expect(body.CallBackURL).not.toMatch(/example-dev-tunnel|example-travel/);
  });

  it("refuses non-KES currencies instead of charging the wrong amount", async () => {
    const p = new MpesaProvider(cfg(), fakeDaraja({ ok: true }));
    await expect(p.createIntent({ paymentId: PAYMENT, bookingId: "b", amount: 500, currency: "USD", phoneNumber: "0712345678", description: "x" })).rejects.toThrow(/only collect KES/);
  });

  it("fails closed with no public URL or secret rather than registering an unreachable/unauthenticated callback", async () => {
    for (const over of [{ publicApiUrl: undefined }, { callbackSecret: undefined }]) {
      const p = new MpesaProvider(cfg(over), fakeDaraja({ ok: true }));
      await expect(p.createIntent({ paymentId: PAYMENT, bookingId: "b", amount: 500, currency: "KES", phoneNumber: "0712345678", description: "x" })).rejects.toThrow(/callbacks are not configured/);
    }
  });
});

describe("mpesa-callback helpers", () => {
  it("allowlist: empty = disabled, otherwise exact match only", () => {
    expect(isIpAllowed([], undefined)).toBe(true);
    expect(isIpAllowed(["1.1.1.1"], "1.1.1.1")).toBe(true);
    expect(isIpAllowed(["1.1.1.1"], "1.1.1.11")).toBe(false);
    expect(isIpAllowed(parseIpAllowlist(" 1.1.1.1 ,, 2.2.2.2 "), "2.2.2.2")).toBe(true);
  });
  it("takes the left-most X-Forwarded-For entry", () => {
    expect(clientIpFromHeaders({ "x-forwarded-for": "9.9.9.9, 10.0.0.1" })).toBe("9.9.9.9");
    expect(clientIpFromHeaders({ "x-real-ip": "8.8.8.8" })).toBe("8.8.8.8");
    expect(clientIpFromHeaders({})).toBeUndefined();
  });
  it("parses the documented callback shape and rejects junk", () => {
    expect(parseStkCallback(JSON.parse(paidBody(10)))).toMatchObject({ amount: 10, resultCode: 0, receiptNumber: "QGR7ABC123" });
    expect(() => parseStkCallback({ Body: {} })).toThrow();
  });
  it("hex-only signatures can't contain Daraja-forbidden keywords", () => {
    expect(signCallbackPath(SECRET, PAYMENT)).toMatch(/^[0-9a-f]{64}$/);
  });
});

// ---------------------------------------------------------------------------
// Refunds: Daraja Transaction Reversal
// ---------------------------------------------------------------------------
import { signReversalPath } from "./mpesa-callback.js";

const REFUND = "33333333-3333-3333-3333-333333333333";
const refundCfg = (over: Partial<MpesaConfig> = {}) => cfg({ initiatorName: "apiop", securityCredential: "ZW5jcnlwdGVk", ...over });
const refundParams = (over: any = {}) => ({
  providerReference: "ws_CO_1", amount: 1234.56, currency: "KES", reason: "Customer cancelled",
  refundId: REFUND, providerReceipt: "QGR7ABC123", originalAmount: 1234.56, ...over,
});
function reversalFetch(response: { ok?: boolean; body: any }) {
  return vi.fn(async (url: any) => {
    if (String(url).includes("/oauth/")) return new Response(JSON.stringify({ access_token: "tok", expires_in: "1" }));
    return response.ok === false ? new Response("nope", { status: 500 }) : new Response(JSON.stringify(response.body));
  }) as unknown as typeof fetch;
}
const accepted = { ResponseCode: "0", OriginatorConversationID: "conv-123", ConversationID: "AG_1", ResponseDescription: "Accept the service request successfully." };

describe("MpesaProvider.refund (Transaction Reversal)", () => {
  it("refuses, loudly, when initiator credentials aren't configured", async () => {
    const p = new MpesaProvider(cfg(), reversalFetch({ body: accepted }));
    await expect(p.refund(refundParams())).rejects.toThrow(/not configured/i);
  });

  it("refuses when the original receipt number wasn't recorded", async () => {
    const p = new MpesaProvider(refundCfg(), reversalFetch({ body: accepted }));
    await expect(p.refund(refundParams({ providerReceipt: null }))).rejects.toThrow(/receipt number was not recorded/i);
  });

  it("refuses a partial refund (reversals are full-amount only) without calling Daraja", async () => {
    const f = reversalFetch({ body: accepted });
    const p = new MpesaProvider(refundCfg(), f);
    await expect(p.refund(refundParams({ amount: 500 }))).rejects.toThrow(/full-amount only/i);
    expect(f).not.toHaveBeenCalled();
  });

  it("refuses non-KES", async () => {
    const p = new MpesaProvider(refundCfg(), reversalFetch({ body: accepted }));
    await expect(p.refund(refundParams({ currency: "USD" }))).rejects.toThrow(/only refund KES/);
  });

  it("sends the reversal keyed by receipt number with signed result + timeout URLs, and reports PENDING (never REFUNDED)", async () => {
    const f = reversalFetch({ body: accepted });
    const res = await new MpesaProvider(refundCfg(), f).refund(refundParams());
    expect(res).toMatchObject({ status: "REFUND_PENDING", providerReference: "conv-123" });
    const call = (f as any).mock.calls.find((c: any[]) => String(c[0]).includes("/reversal/"));
    const body = JSON.parse(call[1].body);
    expect(body).toMatchObject({ CommandID: "TransactionReversal", TransactionID: "QGR7ABC123", Amount: 1235, Initiator: "apiop", Occasion: REFUND });
    const sig = signReversalPath(SECRET, REFUND);
    expect(body.ResultURL).toBe(`https://api.example.test/api/v1/payments/webhooks/reversal/${REFUND}/${sig}`);
    expect(body.QueueTimeOutURL).toBe(`https://api.example.test/api/v1/payments/webhooks/reversal-timeout/${REFUND}/${sig}`);
    expect(body.ResultURL + body.QueueTimeOutURL).not.toMatch(/mpesa|safaricom/i);
  });

  it("surfaces a Daraja rejection and an HTTP failure as errors (so the refund is rolled back)", async () => {
    await expect(new MpesaProvider(refundCfg(), reversalFetch({ body: { ResponseCode: "1", ResponseDescription: "Invalid TransactionID" } })).refund(refundParams())).rejects.toThrow(/Invalid TransactionID/);
    await expect(new MpesaProvider(refundCfg(), reversalFetch({ ok: false, body: {} })).refund(refundParams())).rejects.toThrow(/Reversal request failed/);
  });
});

describe("MpesaProvider.verifyReversalCallback", () => {
  const result = (code: number, extra: any = {}) =>
    JSON.stringify({ Result: { ResultType: 0, ResultCode: code, ResultDesc: code === 0 ? "ok" : "failed", OriginatorConversationID: "conv-123", ConversationID: "AG_1", ResultParameters: { ResultParameter: [{ Key: "Amount", Value: 1235 }] }, ...extra } });
  const good = { refundId: REFUND, signature: signReversalPath(SECRET, REFUND), kind: "result" as const };
  const p = () => new MpesaProvider(refundCfg(), reversalFetch({ body: accepted }));

  it("accepts a correctly signed success result and parses it", () => {
    expect(p().verifyReversalCallback(result(0), good)).toMatchObject({ refundId: REFUND, outcome: "SUCCEEDED", amount: 1235, originatorConversationId: "conv-123" });
  });
  it("maps a non-zero result code to FAILED", () => {
    expect(p().verifyReversalCallback(result(2001), good).outcome).toBe("FAILED");
  });
  it("treats the timeout URL as TIMEOUT (unknown), whatever the body says", () => {
    expect(p().verifyReversalCallback("", { ...good, kind: "timeout" }).outcome).toBe("TIMEOUT");
    expect(p().verifyReversalCallback(result(0), { ...good, kind: "timeout" }).outcome).toBe("TIMEOUT");
  });
  it("rejects a missing or forged signature", () => {
    expect(() => p().verifyReversalCallback(result(0), { ...good, signature: "00".repeat(32) })).toThrow(/signature/i);
    expect(() => p().verifyReversalCallback(result(0), { refundId: REFUND, kind: "result" })).toThrow(/signature/i);
  });
  it("a PAYMENT-callback signature can't be replayed as a refund-result signature (domain separation)", () => {
    expect(() => p().verifyReversalCallback(result(0), { ...good, signature: signCallbackPath(SECRET, REFUND) })).toThrow(/signature/i);
  });
  it("enforces the IP allowlist", () => {
    const q = new MpesaProvider(refundCfg({ callbackIpAllowlist: "196.201.214.200" }), reversalFetch({ body: accepted }));
    expect(() => q.verifyReversalCallback(result(0), { ...good, clientIp: "6.6.6.6" })).toThrow(/not permitted/i);
    expect(q.verifyReversalCallback(result(0), { ...good, clientIp: "196.201.214.200" }).outcome).toBe("SUCCEEDED");
  });
  it("rejects a signed but malformed result", () => {
    expect(() => p().verifyReversalCallback("{}", good)).toThrow(/shape/i);
  });
});
