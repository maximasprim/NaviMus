import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { randomUUID } from "node:crypto";
import { createPaymentIntentSchema, refundRequestSchema } from "@travel/validation";
import { ok, paginated } from "@travel/http";
import { requireAuth, requirePermissions } from "@travel/auth";
import { OperatorService } from "@travel/service-operators/internal";
import type { PaymentService } from "./services/payment-service.js";
import { clientIpFromHeaders } from "./providers/mpesa-callback.js";

export function buildPaymentRoutes(service: PaymentService, operators: OperatorService) {
  const app = new Hono();

  app.post("/intents", requireAuth, zValidator("json", createPaymentIntentSchema), async (c) => {
    const input = c.req.valid("json");
    // Payment intent creation is idempotent per Idempotency-Key, same as booking
    // creation - falls back to a generated key if the client didn't send one,
    // though clients SHOULD always send one to survive network retries safely.
    const idempotencyKey = c.req.header("idempotency-key") ?? randomUUID();
    const payment = await service.createIntent(c.get("tenantId"), input, idempotencyKey);
    return ok(c, payment, undefined, 201);
  });

  app.get("/bookings/:bookingId/ledger", requireAuth, requirePermissions("payment:view"), async (c) => {
    const bookingId = c.req.param("bookingId");
    if (!bookingId) return c.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Missing bookingId" } }, 400);
    const ledger = await service.getLedger(c.get("tenantId"), bookingId);
    return ok(c, ledger);
  });

  app.get("/bookings/:bookingId/payments", requireAuth, requirePermissions("payment:view"), async (c) => {
    const bookingId = c.req.param("bookingId");
    if (!bookingId) return c.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Missing bookingId" } }, 400);
    const payments = await service.listPaymentsForBooking(c.get("tenantId"), bookingId);
    return ok(c, payments);
  });

  // Section 32 (invoicing) / section 30 (customer dashboard: invoices).
  // Scoped to the signed-in user's own bookings - never accepts an
  // arbitrary invoice id without an ownership check.
  app.get("/invoices", requireAuth, async (c) => {
    const authUser = c.get("authUser");
    const page = Number(c.req.query("page") ?? 1);
    const pageSize = Number(c.req.query("pageSize") ?? 20);
    const { items, total } = await service.listMyInvoices(c.get("tenantId"), authUser.sub, page, pageSize);
    return paginated(c, items, page, pageSize, total);
  });

  app.get("/invoices/:id", requireAuth, async (c) => {
    const authUser = c.get("authUser");
    const id = c.req.param("id");
    if (!id) return c.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Missing id" } }, 400);
    const invoice = await service.getMyInvoice(c.get("tenantId"), id, authUser.sub);
    return ok(c, invoice);
  });

  /**
   * Operator self-service earnings. Deliberately "/me" rather than
   * "/:operatorId" - resolving the caller's own operator via
   * resolveOperatorForUser means there's no operatorId to check
   * ownership of in the first place, closing off any IDOR risk by
   * construction rather than by an extra authorization check that
   * could be forgotten later.
   */
  app.get("/earnings/me", requireAuth, async (c) => {
    const authUser = c.get("authUser");
    const operator = await operators.resolveOperatorForUser(c.get("tenantId"), authUser.sub);
    const from = c.req.query("from");
    const to = c.req.query("to");
    const earnings = await service.getOperatorEarnings(c.get("tenantId"), operator.id, { from, to });
    return ok(c, earnings);
  });

  app.get("/earnings/me/timeseries", requireAuth, async (c) => {
    const authUser = c.get("authUser");
    const operator = await operators.resolveOperatorForUser(c.get("tenantId"), authUser.sub);
    const from = c.req.query("from");
    const to = c.req.query("to");
    const series = await service.getOperatorEarningsTimeSeries(c.get("tenantId"), operator.id, { from, to });
    return ok(c, series);
  });

  app.post("/refunds", requireAuth, requirePermissions("payment:refund"), zValidator("json", refundRequestSchema), async (c) => {
    const input = c.req.valid("json");
    const result = await service.refund(c.get("tenantId"), input);
    return ok(c, result);
  });

  /**
   * Webhook endpoints deliberately do NOT go through requireAuth -
   * the provider calling them can't present our JWT. Trust instead
   * comes entirely from signature verification inside
   * PaymentService.handleWebhook / the provider implementation.
   * Raw body text (not parsed JSON) is required for signature
   * verification to match what the provider actually signed.
   */
  /**
   * M-Pesa (Daraja) STK callback. The path - not a header - carries the
   * authentication, because Daraja can't send us one: :signature is an
   * HMAC of :paymentId that only this server can mint, embedded in the
   * CallBackURL we gave Safaricom when initiating that specific payment
   * (see MpesaProvider.buildCallbackUrl). The old unauthenticated
   * /webhooks/mpesa route was removed entirely - leaving it mounted would
   * have kept the hole open. The path deliberately avoids "mpesa": Daraja
   * rejects callback URLs containing certain brand keywords.
   */
  app.post("/webhooks/stk/:paymentId/:signature", async (c) => {
    const rawBody = await c.req.text();
    const headers = Object.fromEntries(c.req.raw.headers.entries());
    const result = await service.handleWebhook("mpesa", rawBody, headers, {
      paymentId: c.req.param("paymentId"),
      signature: c.req.param("signature"),
      clientIp: clientIpFromHeaders(headers),
    });
    // M-Pesa expects a 200 with this exact shape to stop retrying the callback.
    return c.json({ ResultCode: 0, ResultDesc: "Accepted", ...result });
  });

  /**
   * M-Pesa Transaction Reversal (refund) callbacks. Authenticated exactly like
   * the payment callback: the HMAC of :refundId in the path is minted only by
   * us, in the URLs we gave Safaricom when requesting that reversal. The
   * timeout URL is separate because a timeout means "unknown", not "failed".
   */
  for (const kind of ["reversal", "reversal-timeout"] as const) {
    app.post(`/webhooks/${kind}/:refundId/:signature`, async (c) => {
      const rawBody = await c.req.text();
      const headers = Object.fromEntries(c.req.raw.headers.entries());
      const result = await service.handleReversalCallback(rawBody, {
        refundId: c.req.param("refundId"),
        signature: c.req.param("signature"),
        clientIp: clientIpFromHeaders(headers),
        kind: kind === "reversal" ? "result" : "timeout",
      });
      return c.json({ ResultCode: 0, ResultDesc: "Accepted", ...result });
    });
  }

  app.post("/webhooks/stripe", async (c) => {
    const rawBody = await c.req.text();
    const headers = Object.fromEntries(c.req.raw.headers.entries());
    const result = await service.handleWebhook("stripe", rawBody, headers);
    return ok(c, result);
  });

  /**
   * Dev/test-only: simulates the mock provider confirming or
   * failing a payment. handleWebhook's getPaymentProvider() call
   * production-gates "mock" regardless of what's POSTed here, so
   * this route is safe to leave mounted in every environment
   * rather than needing its own environment check.
   */
  app.post("/webhooks/mock", async (c) => {
    const rawBody = await c.req.text();
    const result = await service.handleWebhook("mock", rawBody, {});
    return ok(c, result);
  });

  return app;
}
