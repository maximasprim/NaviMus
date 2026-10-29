import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createDb, runInTenantContext } from "@travel/database";
import type { MpesaConfig } from "./providers/mpesa-provider.js";

/**
 * The refund state machine against a REAL database, as the unprivileged
 * `travel_app` role (row-level security in force). Providers are controlled
 * fakes so each outcome (sync success, error, async pending, callbacks) can
 * be forced. Skipped when RLS_TEST_ADMIN_URL / RLS_TEST_APP_URL are absent.
 */
const ADMIN_URL = process.env.RLS_TEST_ADMIN_URL;
const APP_URL = process.env.RLS_TEST_APP_URL;
const maybe = ADMIN_URL && APP_URL ? describe : describe.skip;

const SECRET = "cd".repeat(32);
const state: { fake: any; mpesa: any } = { fake: null, mpesa: null };

vi.mock("./providers/index.js", () => ({
  getPaymentProvider: (name: string) => (name === "mpesa" ? state.mpesa : state.fake),
}));

maybe("refunds (real database, as travel_app)", async () => {
  const { PaymentService } = await import("./services/payment-service.js");
  const { PaymentRepository } = await import("./repositories/payment-repository.js");
  const { SettingsRepository } = await import("./repositories/settings-repository.js");
  const { MpesaProvider } = await import("./providers/mpesa-provider.js");
  const { signReversalPath, signCallbackPath } = await import("./providers/mpesa-callback.js");

  const admin = postgres(ADMIN_URL ?? "", { max: 2 });
  const db = createDb(APP_URL ?? "", { name: "refund-itest", poolMax: 6 });
  const tag = `rfnd${Date.now()}`;
  const events = { publish: vi.fn(async () => undefined) };
  let service: InstanceType<typeof PaymentService>;
  let tenantId = "";
  let userId = "";
  let n = 0;

  const mpesaCfg: MpesaConfig = {
    env: "sandbox", consumerKey: "k", consumerSecret: "s", shortcode: "174379", passkey: "p",
    publicApiUrl: "https://api.example.test", callbackSecret: SECRET, verifyWithQuery: false,
    initiatorName: "apiop", securityCredential: "ZW5j",
  };
  const darajaFetch = vi.fn(async (url: any) => {
    if (String(url).includes("/oauth/")) return new Response(JSON.stringify({ access_token: "t", expires_in: "1" }));
    return new Response(JSON.stringify({ ResponseCode: "0", OriginatorConversationID: "conv-" + Math.random().toString(36).slice(2) }));
  });

  /** A PAID payment of `amount` with its transaction row, ready to be refunded. */
  async function paidPayment(provider: "mock" | "mpesa", currency = provider === "mpesa" ? "KES" : "USD", amount = 100) {
    n++;
    const [b] = await admin`insert into bookings (tenant_id, user_id, travel_date, currency, contact_email, contact_phone, idempotency_key, status)
      values (${tenantId}, ${userId}, '2031-01-01', ${currency}, 'r@x.test', '+254700000000', ${`${tag}-b${n}`}, 'CONFIRMED') returning id`;
    const [p] = await admin`insert into payments (tenant_id, booking_id, provider, status, original_amount, original_currency, base_currency_amount, idempotency_key, provider_receipt)
      values (${tenantId}, ${b!.id}, ${provider}, 'PAID', ${amount}, ${currency}, ${amount}, ${`${tag}-p${n}`}, ${"RCPT" + n}) returning id`;
    await admin`insert into payment_transactions (payment_id, provider_reference) values (${p!.id}, ${`${tag}-ref${n}`})`;
    return { paymentId: p!.id as string, bookingId: b!.id as string, amount };
  }
  // Refund requests arrive through the gateway, which wraps every tenant request
  // in the tenant's RLS context - do the same. (Provider CALLBACKS have no
  // tenant and are invoked bare, exactly as the gateway does.)
  // Hono turns a handler error into a response INSIDE the middleware chain, so the
  // request's transaction still COMMITs; mimic that by catching in the context
  // and rethrowing only after it has closed.
  const refund = async (input: any) => {
    let failure: unknown;
    const result = await runInTenantContext(db, tenantId, async () => {
      try {
        return await service.refund(tenantId, input);
      } catch (err) {
        failure = err;
        return undefined;
      }
    });
    if (failure) throw failure;
    return result!;
  };
  const payRow = async (id: string) => (await admin`select status from payments where id = ${id}`)[0]!.status as string;
  const refundRows = async (id: string) => admin`select id, status, provider_reference from payment_refunds where payment_id = ${id} order by created_at`;
  const ledger = async (id: string) => admin`select amount, entry_type from ledger_entries where payment_id = ${id} and entry_type = 'refund'`;

  beforeAll(async () => {
    [{ id: tenantId }] = (await admin`select id from tenants order by created_at limit 1`) as any;
    [{ id: userId }] = (await admin`select id from users where tenant_id = ${tenantId} limit 1`) as any;
    service = new PaymentService(db, new PaymentRepository(db), new SettingsRepository(db), events as any, {} as any);
    state.mpesa = new MpesaProvider(mpesaCfg, darajaFetch as any);
  });
  beforeEach(() => {
    events.publish.mockClear();
    darajaFetch.mockClear();
    state.fake = { name: "mock", amountTolerance: 0.01, refund: vi.fn(async () => ({ providerReference: "prov-ref", status: "REFUNDED", raw: {} })) };
  });
  afterAll(async () => {
    await admin`delete from ledger_entries where payment_id in (select id from payments where idempotency_key like ${tag + "%"})`;
    await admin`delete from payment_refunds where payment_id in (select id from payments where idempotency_key like ${tag + "%"})`;
    await admin`delete from payment_transactions where provider_reference like ${tag + "%"}`;
    await admin`delete from payments where idempotency_key like ${tag + "%"}`;
    await admin`delete from bookings where idempotency_key like ${tag + "%"}`;
    await admin.end();
  });

  it("a provider that completes synchronously: refunded, ledgered once, event published once", async () => {
    const pay = await paidPayment("mock");
    const res = await refund({ paymentId: pay.paymentId, reason: "test" } as any);
    expect(res).toMatchObject({ status: "REFUNDED", amount: 100 });
    expect(await payRow(pay.paymentId)).toBe("REFUNDED");
    expect((await refundRows(pay.paymentId))[0]).toMatchObject({ status: "REFUNDED", provider_reference: "prov-ref" });
    const l = await ledger(pay.paymentId);
    expect(l).toHaveLength(1);
    expect(Number(l[0]!.amount)).toBe(-100);
    expect(events.publish).toHaveBeenCalledTimes(1);
  });

  it("a partial refund leaves the payment PARTIALLY_REFUNDED", async () => {
    const pay = await paidPayment("mock");
    await refund({ paymentId: pay.paymentId, amount: 40 } as any);
    expect(await payRow(pay.paymentId)).toBe("PARTIALLY_REFUNDED");
    expect(Number((await ledger(pay.paymentId))[0]!.amount)).toBe(-40);
  });

  it("when the provider throws, the claim is undone: payment back to PAID, refund FAILED, nothing ledgered", async () => {
    const pay = await paidPayment("mock");
    state.fake.refund.mockRejectedValueOnce(new Error("provider exploded"));
    await expect(refund({ paymentId: pay.paymentId } as any)).rejects.toThrow(/provider exploded/);
    expect(await payRow(pay.paymentId)).toBe("PAID");
    expect((await refundRows(pay.paymentId))[0]!.status).toBe("FAILED");
    expect(await ledger(pay.paymentId)).toHaveLength(0);
    expect(events.publish).not.toHaveBeenCalled();
    // and it can be retried
    await expect(refund({ paymentId: pay.paymentId } as any)).resolves.toMatchObject({ status: "REFUNDED" });
  });

  it("an asynchronous provider leaves it REFUND_PENDING: no ledger entry, no 'completed' event", async () => {
    const pay = await paidPayment("mock");
    state.fake.refund.mockResolvedValueOnce({ providerReference: "async-ref", status: "REFUND_PENDING", raw: {} });
    const res = await refund({ paymentId: pay.paymentId } as any);
    expect(res.status).toBe("REFUND_PENDING");
    expect(await payRow(pay.paymentId)).toBe("REFUND_PENDING");
    expect((await refundRows(pay.paymentId))[0]).toMatchObject({ status: "REFUND_PENDING", provider_reference: "async-ref" });
    expect(await ledger(pay.paymentId)).toHaveLength(0);
    expect(events.publish).not.toHaveBeenCalled();
  });

  it("two simultaneous refund requests: exactly one reaches the provider, the other is refused", async () => {
    const pay = await paidPayment("mock");
    state.fake.refund.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 50));
      return { providerReference: "once", status: "REFUNDED", raw: {} };
    });
    const results = await Promise.allSettled([
      refund({ paymentId: pay.paymentId } as any),
      refund({ paymentId: pay.paymentId } as any),
      refund({ paymentId: pay.paymentId } as any),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(2);
    expect(state.fake.refund).toHaveBeenCalledTimes(1);
    expect(await ledger(pay.paymentId)).toHaveLength(1);
    expect(await refundRows(pay.paymentId)).toHaveLength(1);
  });

  it("refuses a refund above the original amount, a zero refund, and a refund of an unpaid payment", async () => {
    const pay = await paidPayment("mock");
    await expect(refund({ paymentId: pay.paymentId, amount: 101 } as any)).rejects.toThrow(/cannot exceed/);
    await expect(refund({ paymentId: pay.paymentId, amount: 0 } as any)).rejects.toThrow(/greater than zero/);
    await admin`update payments set status = 'PENDING' where id = ${pay.paymentId}`;
    await expect(refund({ paymentId: pay.paymentId } as any)).rejects.toThrow(/Cannot refund a payment in status PENDING/);
    expect(state.fake.refund).not.toHaveBeenCalled();
  });

  describe("M-Pesa reversal callbacks", () => {
    const resultBody = (conv: string, code = 0, amount = 100) =>
      JSON.stringify({ Result: { ResultType: 0, ResultCode: code, ResultDesc: code === 0 ? "ok" : "failed", OriginatorConversationID: conv, ConversationID: "AG", ResultParameters: { ResultParameter: [{ Key: "Amount", Value: amount }] } } });
    const cbCtx = (refundId: string, kind: "result" | "timeout" = "result") => ({ refundId, signature: signReversalPath(SECRET, refundId), kind });

    async function pendingMpesaRefund() {
      const pay = await paidPayment("mpesa");
      const res = await refund({ paymentId: pay.paymentId, reason: "cancel" } as any);
      expect(res.status).toBe("REFUND_PENDING"); // real MpesaProvider: Daraja only ACCEPTED the request
      const [r] = await refundRows(pay.paymentId);
      return { pay, refundId: r!.id as string, conv: r!.provider_reference as string };
    }

    it("a real M-Pesa refund request leaves everything pending until Safaricom's callback", async () => {
      const { pay } = await pendingMpesaRefund();
      expect(await payRow(pay.paymentId)).toBe("REFUND_PENDING");
      expect(await ledger(pay.paymentId)).toHaveLength(0);
      expect(darajaFetch.mock.calls.some((c) => String(c[0]).includes("/reversal/"))).toBe(true);
    });

    it("a signed success callback settles it; a replay of the same callback does nothing more", async () => {
      const { pay, refundId, conv } = await pendingMpesaRefund();
      const first = await service.handleReversalCallback(resultBody(conv), cbCtx(refundId));
      expect(first).toMatchObject({ matched: true, settled: true, refundStatus: "REFUNDED" });
      expect(await payRow(pay.paymentId)).toBe("REFUNDED");
      expect(await ledger(pay.paymentId)).toHaveLength(1);
      expect(events.publish).toHaveBeenCalledTimes(1);

      const replay = await service.handleReversalCallback(resultBody(conv), cbCtx(refundId));
      expect(replay).toMatchObject({ settled: false, skipped: "already_settled" });
      expect(await ledger(pay.paymentId)).toHaveLength(1);
      expect(events.publish).toHaveBeenCalledTimes(1);
    });

    it("a failed reversal restores the payment to PAID (the customer was NOT refunded)", async () => {
      const { pay, refundId, conv } = await pendingMpesaRefund();
      await service.handleReversalCallback(resultBody(conv, 2001), cbCtx(refundId));
      expect(await payRow(pay.paymentId)).toBe("PAID");
      expect((await refundRows(pay.paymentId))[0]!.status).toBe("FAILED");
      expect(await ledger(pay.paymentId)).toHaveLength(0);
      expect(events.publish).not.toHaveBeenCalled();
    });

    it("a TIMEOUT is not a failure: stays pending for a human, nothing ledgered", async () => {
      const { pay, refundId } = await pendingMpesaRefund();
      const res = await service.handleReversalCallback("", cbCtx(refundId, "timeout"));
      expect(res).toMatchObject({ outcome: "timeout_needs_review" });
      expect(await payRow(pay.paymentId)).toBe("REFUND_PENDING");
      expect(await ledger(pay.paymentId)).toHaveLength(0);
    });

    it("rejects a forged signature, and a payment-callback signature, changing nothing", async () => {
      const { pay, refundId, conv } = await pendingMpesaRefund();
      await expect(service.handleReversalCallback(resultBody(conv), { refundId, signature: "00".repeat(32), kind: "result" })).rejects.toThrow(/signature/i);
      await expect(service.handleReversalCallback(resultBody(conv), { refundId, signature: signCallbackPath(SECRET, refundId), kind: "result" })).rejects.toThrow(/signature/i);
      expect(await payRow(pay.paymentId)).toBe("REFUND_PENDING");
    });

    it("a result for a different conversation id, or a different amount, is not applied", async () => {
      const { pay, refundId, conv } = await pendingMpesaRefund();
      expect(await service.handleReversalCallback(resultBody("some-other-conv"), cbCtx(refundId))).toMatchObject({ rejected: "conversation_mismatch" });
      expect(await service.handleReversalCallback(resultBody(conv, 0, 7), cbCtx(refundId))).toMatchObject({ settled: false, skipped: "amount_mismatch" });
      expect(await payRow(pay.paymentId)).toBe("REFUND_PENDING");
      expect(await ledger(pay.paymentId)).toHaveLength(0);
    });
  });

  it("settleRefund (the Stripe refund.updated path): FAILED restores the payment; unknown refunds are reported, not crashed on", async () => {
    const pay = await paidPayment("mock");
    state.fake.refund.mockResolvedValueOnce({ providerReference: "stripe-re", status: "REFUND_PENDING", raw: {} });
    await refund({ paymentId: pay.paymentId } as any);
    const [r] = await refundRows(pay.paymentId);
    expect(await service.settleRefund(r!.id as string, { kind: "FAILED" })).toMatchObject({ settled: true, refundStatus: "FAILED" });
    expect(await payRow(pay.paymentId)).toBe("PAID");
    expect(await service.settleRefund("00000000-0000-0000-0000-00000000dead", { kind: "SUCCEEDED" })).toMatchObject({ settled: false, skipped: "unknown_refund" });
  });
});
