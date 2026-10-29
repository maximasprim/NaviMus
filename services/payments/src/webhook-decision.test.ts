import { describe, expect, it } from "vitest";
import { evaluateWebhook, involvesPossibleRealMoney } from "./webhook-decision.js";

const payment = { id: "pay-1", status: "PENDING", originalAmount: "1300.00", originalCurrency: "USD" };
const paid = { outcome: "PAID" as const, amount: 1300, currency: "USD", expectedPaymentId: "pay-1" };
const base = { payment, bookingStatus: "PAYMENT_PROCESSING", amountTolerance: 0.01 };

describe("evaluateWebhook", () => {
  it("applies a consistent PAID event", () => {
    expect(evaluateWebhook({ ...base, event: paid })).toEqual({ action: "apply" });
  });

  it("rejects an event signed for a different payment than its reference resolves to", () => {
    expect(evaluateWebhook({ ...base, event: { ...paid, expectedPaymentId: "pay-OTHER" } })).toEqual({
      action: "reject",
      reason: "payment_binding_mismatch",
    });
  });

  it("applies when the provider supplies no binding (mock)", () => {
    expect(evaluateWebhook({ ...base, event: { ...paid, expectedPaymentId: undefined } }).action).toBe("apply");
  });

  it("rejects underpayment and overpayment alike", () => {
    expect(evaluateWebhook({ ...base, event: { ...paid, amount: 1 } })).toEqual({ action: "reject", reason: "amount_mismatch" });
    expect(evaluateWebhook({ ...base, event: { ...paid, amount: 99999 } })).toEqual({ action: "reject", reason: "amount_mismatch" });
  });

  it("honours the provider's rounding tolerance (M-Pesa rounds to whole KES)", () => {
    const kes = { ...base, payment: { ...payment, originalAmount: "1234.56", originalCurrency: "KES" } };
    const ev = { ...paid, currency: "KES", amount: 1235 };
    expect(evaluateWebhook({ ...kes, event: ev, amountTolerance: 0.5 }).action).toBe("apply");
    expect(evaluateWebhook({ ...kes, event: ev, amountTolerance: 0.01 }).action).toBe("reject");
  });

  it("rejects a currency mismatch even when the numbers match", () => {
    expect(evaluateWebhook({ ...base, event: { ...paid, currency: "KES" } })).toEqual({ action: "reject", reason: "currency_mismatch" });
  });

  it("ignores events the provider marked IGNORED, so they can't fail a booking", () => {
    expect(evaluateWebhook({ ...base, event: { ...paid, outcome: "IGNORED" } })).toEqual({ action: "ignore", reason: "event_type_ignored" });
  });

  it("ignores a replay against an already-settled payment instead of double-crediting", () => {
    for (const status of ["PAID", "REFUNDED", "PARTIALLY_REFUNDED", "REFUND_PENDING"]) {
      expect(evaluateWebhook({ ...base, payment: { ...payment, status }, event: paid })).toEqual({ action: "ignore", reason: "already_settled" });
    }
  });

  it("flags money arriving for a payment already marked failed - never silently drops or applies it", () => {
    expect(evaluateWebhook({ ...base, payment: { ...payment, status: "FAILED" }, event: paid })).toEqual({
      action: "reject",
      reason: "paid_after_failure",
    });
    expect(evaluateWebhook({ ...base, payment: { ...payment, status: "FAILED" }, event: { ...paid, outcome: "FAILED" } }).action).toBe("ignore");
  });

  it("flags money arriving after the booking expired or was cancelled", () => {
    for (const bookingStatus of ["EXPIRED", "CANCELLED", "FAILED", "CONFIRMED"]) {
      expect(evaluateWebhook({ ...base, bookingStatus, event: paid })).toEqual({ action: "reject", reason: "booking_not_payable" });
    }
  });

  it("applies a FAILED outcome without requiring amount or booking-state checks", () => {
    expect(evaluateWebhook({ ...base, bookingStatus: "EXPIRED", event: { ...paid, outcome: "FAILED", amount: 0 } }).action).toBe("apply");
  });

  it("treats everything except a binding mismatch as possible real money", () => {
    expect(involvesPossibleRealMoney("payment_binding_mismatch")).toBe(false);
    expect(involvesPossibleRealMoney("amount_mismatch")).toBe(true);
    expect(involvesPossibleRealMoney("booking_not_payable")).toBe(true);
  });
});
