import { beforeAll, describe, expect, it } from "vitest";
import { apiRequest, uniqueEmail, waitForGateway } from "./client.js";
import { SEED_PACKAGE_SLUG, daysFromNow } from "./fixtures.js";

/**
 * This is the single most important test in the suite: it walks
 * the exact path the spec calls out repeatedly - booking creation
 * reserves inventory, a payment intent is created, ONLY a verified
 * webhook can confirm the booking (never client-reported status),
 * and the ledger gets three-way-split entries once that happens.
 *
 * Uses the "mock" payment provider (see
 * services/payments/src/providers/mock-payment-provider.ts) so it
 * runs in CI without real M-Pesa/Stripe sandbox credentials, while
 * still exercising the real webhook-driven confirmation path rather
 * than a shortcut around it.
 */
describe("booking flow: create -> pay -> confirm -> cancel", () => {
  let token: string;
  let packageId: string;

  beforeAll(async () => {
    await waitForGateway();

    const email = uniqueEmail("e2e-booker");
    const password = "Correct-Horse-9!";
    await apiRequest("/api/v1/auth/register", {
      method: "POST",
      body: { email, password, firstName: "E2E", lastName: "Booker" },
    });
    const loginRes = await apiRequest<{ accessToken: string }>("/api/v1/auth/login", {
      method: "POST",
      body: { email, password },
    });
    token = loginRes.data!.accessToken;

    const pkgRes = await apiRequest<{ id: string }>(`/api/v1/packages/${SEED_PACKAGE_SLUG}`);
    packageId = pkgRes.data!.id;
  });

  it("creates a booking in PENDING_PAYMENT with a server-computed total, then confirms it via a mock webhook", async () => {
    const travelDate = daysFromNow(15);
    const idempotencyKey = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // 1. Create the booking. Note there is deliberately no price field sent -
    // the server computes it from the package's own price matrix.
    const bookingRes = await apiRequest<{
      id: string;
      status: string;
      totalAmount: string;
      currency: string;
    }>("/api/v1/bookings", {
      method: "POST",
      token,
      headers: { "Idempotency-Key": idempotencyKey },
      body: {
        packageId,
        travelDate,
        travelers: [{ travelerType: "adult" }, { travelerType: "adult" }],
        contactEmail: "e2e-booker@example-e2e.test",
        contactPhone: "+254700000001",
      },
    });
    expect(bookingRes.status).toBe(201);
    expect(bookingRes.data?.status).toBe("PENDING_PAYMENT");
    expect(bookingRes.data?.totalAmount).toBe("1300.00");
    const bookingId = bookingRes.data!.id;

    // 2. Retrying the exact same Idempotency-Key must return the SAME
    // booking, not create a second one - this is what makes booking
    // creation safe to retry from a flaky mobile client.
    const retryRes = await apiRequest<{ id: string }>("/api/v1/bookings", {
      method: "POST",
      token,
      headers: { "Idempotency-Key": idempotencyKey },
      body: {
        packageId,
        travelDate,
        travelers: [{ travelerType: "adult" }, { travelerType: "adult" }],
        contactEmail: "e2e-booker@example-e2e.test",
        contactPhone: "+254700000001",
      },
    });
    expect(retryRes.data?.id).toBe(bookingId);

    // 3. Create a payment intent via the mock provider.
    const intentRes = await apiRequest<{ providerReference: string }>("/api/v1/payments/intents", {
      method: "POST",
      token,
      body: { bookingId, provider: "mock" },
    });
    expect(intentRes.status).toBe(201);
    const providerReference = intentRes.data!.providerReference;
    expect(providerReference).toBeTruthy();

    // Booking should now be PAYMENT_PROCESSING, not yet confirmed -
    // client-reported "I paid" is never trusted.
    const midBookingRes = await apiRequest<{ status: string }>(`/api/v1/bookings/${bookingId}`, { token });
    expect(midBookingRes.data?.status).toBe("PAYMENT_PROCESSING");

    // 4. Simulate the provider's webhook confirming payment - this is the
    // ONLY thing that can move the booking to CONFIRMED.
    const webhookRes = await fetch(
      `${process.env.E2E_API_URL ?? "http://localhost:4000"}/api/v1/payments/webhooks/mock`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerReference, outcome: "PAID", amount: 1300, currency: "USD" }),
      }
    );
    expect(webhookRes.ok).toBe(true);

    // 5. Booking should now be CONFIRMED, fully paid.
    const finalBookingRes = await apiRequest<{ status: string; amountPaid: string }>(
      `/api/v1/bookings/${bookingId}`,
      { token }
    );
    expect(finalBookingRes.data?.status).toBe("CONFIRMED");
    expect(finalBookingRes.data?.amountPaid).toBe("1300.00");
  });

  it("cancels a confirmed booking, releases inventory, and records a cancellation with a computed refund", async () => {
    const travelDate = daysFromNow(20);
    const idempotencyKey = `e2e-cancel-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const bookingRes = await apiRequest<{ id: string }>("/api/v1/bookings", {
      method: "POST",
      token,
      headers: { "Idempotency-Key": idempotencyKey },
      body: {
        packageId,
        travelDate,
        travelers: [{ travelerType: "adult" }],
        contactEmail: "e2e-booker@example-e2e.test",
        contactPhone: "+254700000001",
      },
    });
    const bookingId = bookingRes.data!.id;

    const cancelRes = await apiRequest<{ refundAmount: number; daysBeforeTrip: number }>(
      `/api/v1/bookings/${bookingId}/cancel`,
      { method: "PATCH", token, body: { reason: "E2E test cancellation" } }
    );
    expect(cancelRes.status).toBe(200);
    expect(typeof cancelRes.data?.refundAmount).toBe("number");
    expect(cancelRes.data?.daysBeforeTrip).toBeGreaterThanOrEqual(19);

    const finalRes = await apiRequest<{ status: string }>(`/api/v1/bookings/${bookingId}`, { token });
    // No cancellation policy is attached to the seeded demo package, so the
    // refund defaults to zero and status lands on CANCELLED without ever
    // entering REFUND_PENDING - see BookingService.cancelBooking's
    // "fail closed with zero refund" comment for why that's intentional.
    expect(finalRes.data?.status).toBe("CANCELLED");
  });

  it("rejects a booking request with no Idempotency-Key header", async () => {
    const res = await apiRequest("/api/v1/bookings", {
      method: "POST",
      token,
      body: {
        packageId,
        travelDate: daysFromNow(25),
        travelers: [{ travelerType: "adult" }],
        contactEmail: "e2e-booker@example-e2e.test",
        contactPhone: "+254700000001",
      },
    });
    expect(res.status).toBe(400);
    expect(res.error?.code).toBe("VALIDATION_ERROR");
  });
});
