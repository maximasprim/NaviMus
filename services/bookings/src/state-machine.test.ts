import { describe, it, expect } from "vitest";
import { BOOKING_STATUSES, BOOKING_STATUS_TRANSITIONS, type BookingStatus } from "@travel/types";
import { isTransitionAllowed } from "./state-machine.js";

describe("booking state machine", () => {
  it("allows the documented happy path: DRAFT -> PENDING_PAYMENT -> PAYMENT_PROCESSING -> CONFIRMED", () => {
    expect(isTransitionAllowed("DRAFT", "PENDING_PAYMENT")).toBe(true);
    expect(isTransitionAllowed("PENDING_PAYMENT", "PAYMENT_PROCESSING")).toBe(true);
    expect(isTransitionAllowed("PAYMENT_PROCESSING", "CONFIRMED")).toBe(true);
  });

  it("allows the cancellation + refund path", () => {
    expect(isTransitionAllowed("CONFIRMED", "CANCEL_REQUESTED")).toBe(true);
    expect(isTransitionAllowed("CANCEL_REQUESTED", "CANCELLED")).toBe(true);
    expect(isTransitionAllowed("CANCELLED", "REFUND_PENDING")).toBe(true);
    expect(isTransitionAllowed("REFUND_PENDING", "REFUNDED")).toBe(true);
  });

  it("rejects skipping straight from DRAFT to CONFIRMED", () => {
    expect(isTransitionAllowed("DRAFT", "CONFIRMED")).toBe(false);
  });

  it("rejects reviving a booking out of a terminal state", () => {
    for (const terminal of ["COMPLETED", "CANCELLED", "REFUNDED", "EXPIRED", "FAILED"] as BookingStatus[]) {
      for (const target of BOOKING_STATUSES) {
        if (terminal === "CANCELLED" && target === "REFUND_PENDING") continue; // the one legitimate exit from CANCELLED
        expect(
          isTransitionAllowed(terminal, target),
          `${terminal} -> ${target} should not be allowed`
        ).toBe(false);
      }
    }
  });

  it("rejects an unpaid booking jumping straight to UPCOMING", () => {
    expect(isTransitionAllowed("PENDING_PAYMENT", "UPCOMING")).toBe(false);
  });

  it("never allows a status to transition to itself", () => {
    for (const status of BOOKING_STATUSES) {
      expect(isTransitionAllowed(status, status), `${status} -> ${status} should not be allowed`).toBe(false);
    }
  });

  it("every status listed in the transition map is a real BookingStatus", () => {
    for (const [from, targets] of Object.entries(BOOKING_STATUS_TRANSITIONS)) {
      expect(BOOKING_STATUSES).toContain(from as BookingStatus);
      for (const target of targets) {
        expect(BOOKING_STATUSES).toContain(target);
      }
    }
  });

  it("every BookingStatus has an entry in the transition map, even if empty (terminal)", () => {
    for (const status of BOOKING_STATUSES) {
      expect(BOOKING_STATUS_TRANSITIONS[status]).toBeDefined();
    }
  });
});
