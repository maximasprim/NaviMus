import { describe, it, expect } from "vitest";
import { passwordSchema, phoneSchema, idempotencyKeySchema, emailSchema } from "./common.js";
import { createBookingSchema } from "./bookings.js";
import { registerSchema } from "./auth.js";

describe("passwordSchema", () => {
  it("accepts a password with upper, lower, number, and 10+ chars", () => {
    expect(passwordSchema.safeParse("Abcdefgh1").success).toBe(false); // 9 chars - too short
    expect(passwordSchema.safeParse("Abcdefghi1").success).toBe(true); // 10 chars
  });

  it("rejects a password missing an uppercase letter", () => {
    expect(passwordSchema.safeParse("lowercase1").success).toBe(false);
  });

  it("rejects a password missing a number", () => {
    expect(passwordSchema.safeParse("NoNumbersHere").success).toBe(false);
  });

  it("rejects a password missing a lowercase letter", () => {
    expect(passwordSchema.safeParse("ALLUPPER123").success).toBe(false);
  });
});

describe("phoneSchema", () => {
  it("accepts a plausible international number with a plus", () => {
    expect(phoneSchema.safeParse("+254712345678").success).toBe(true);
  });

  it("accepts a plausible number without a plus", () => {
    expect(phoneSchema.safeParse("254712345678").success).toBe(true);
  });

  it("rejects a number that's too short", () => {
    expect(phoneSchema.safeParse("+1234").success).toBe(false);
  });

  it("rejects a number starting with 0 (no leading zero in E.164-ish form)", () => {
    expect(phoneSchema.safeParse("+0712345678").success).toBe(false);
  });

  it("rejects letters", () => {
    expect(phoneSchema.safeParse("+254CALLME1").success).toBe(false);
  });
});

describe("idempotencyKeySchema", () => {
  it("accepts alphanumeric keys with hyphens and underscores", () => {
    expect(idempotencyKeySchema.safeParse("web-abc123_DEF-456").success).toBe(true);
  });

  it("rejects keys shorter than 8 characters", () => {
    expect(idempotencyKeySchema.safeParse("short").success).toBe(false);
  });

  it("rejects keys containing spaces or special characters", () => {
    expect(idempotencyKeySchema.safeParse("has a space").success).toBe(false);
    expect(idempotencyKeySchema.safeParse("has/a/slash").success).toBe(false);
  });
});

describe("emailSchema", () => {
  it("lowercases the email", () => {
    const result = emailSchema.safeParse("User@Example.com");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe("user@example.com");
  });

  it("rejects a malformed email", () => {
    expect(emailSchema.safeParse("not-an-email").success).toBe(false);
  });
});

describe("createBookingSchema", () => {
  const base = {
    packageId: "550e8400-e29b-41d4-a716-446655440000",
    travelDate: "2026-09-01",
    travelers: [{ travelerType: "adult" as const }],
    contactEmail: "traveler@example.com",
    contactPhone: "+254712345678",
  };

  it("accepts a minimal valid booking request", () => {
    expect(createBookingSchema.safeParse(base).success).toBe(true);
  });

  it("does NOT accept a client-supplied price field - pricing is always server-computed", () => {
    // The schema has no "amount"/"price"/"totalAmount" field at all; if someone
    // adds one accidentally, Zod's default (strip unknown keys) would let it
    // through silently, so this test asserts the parsed output never carries it.
    const withPrice = { ...base, totalAmount: 1, price: 1, amount: 1 };
    const result = createBookingSchema.safeParse(withPrice);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty("totalAmount");
      expect(result.data).not.toHaveProperty("price");
      expect(result.data).not.toHaveProperty("amount");
    }
  });

  it("rejects a booking with zero travelers", () => {
    expect(createBookingSchema.safeParse({ ...base, travelers: [] }).success).toBe(false);
  });

  it("rejects a malformed travel date", () => {
    expect(createBookingSchema.safeParse({ ...base, travelDate: "09/01/2026" }).success).toBe(false);
  });

  it("rejects an invalid package id", () => {
    expect(createBookingSchema.safeParse({ ...base, packageId: "not-a-uuid" }).success).toBe(false);
  });
});

describe("registerSchema", () => {
  it("accepts a valid registration payload", () => {
    const result = registerSchema.safeParse({
      email: "new@example.com",
      password: "Abcdefghi1",
      firstName: "Amara",
      lastName: "Otieno",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a weak password even with otherwise valid fields", () => {
    const result = registerSchema.safeParse({
      email: "new@example.com",
      password: "weak",
      firstName: "Amara",
      lastName: "Otieno",
    });
    expect(result.success).toBe(false);
  });
});
