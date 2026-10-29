import { describe, it, expect } from "vitest";
import { selectApplicableRule, computeCancellationAmounts, type CancellationRuleBand } from "./cancellation-rules.js";

// The exact bands given as an example in the engineering brief:
//   > 30 days:    100% refund
//   15-30 days:    75% refund
//   7-14 days:     50% refund
//   < 7 days:      25% refund
//   < 48 hours:     0% refund
// Modeled here as day bands (the < 48 hours band collapses into "0 days").
const standardPolicy: CancellationRuleBand[] = [
  { daysBeforeMin: 31, daysBeforeMax: null, refundPercentage: 100, penaltyPercentage: 0 },
  { daysBeforeMin: 15, daysBeforeMax: 30, refundPercentage: 75, penaltyPercentage: 25 },
  { daysBeforeMin: 7, daysBeforeMax: 14, refundPercentage: 50, penaltyPercentage: 50 },
  { daysBeforeMin: 1, daysBeforeMax: 6, refundPercentage: 25, penaltyPercentage: 75 },
  { daysBeforeMin: 0, daysBeforeMax: 0, refundPercentage: 0, penaltyPercentage: 100 },
];

describe("selectApplicableRule", () => {
  it("selects the unbounded top band for 45 days before trip", () => {
    const rule = selectApplicableRule(standardPolicy, 45);
    expect(rule?.refundPercentage).toBe(100);
  });

  it("selects the 15-30 day band at the lower boundary (15 days)", () => {
    const rule = selectApplicableRule(standardPolicy, 15);
    expect(rule?.refundPercentage).toBe(75);
  });

  it("selects the 15-30 day band at the upper boundary (30 days)", () => {
    const rule = selectApplicableRule(standardPolicy, 30);
    expect(rule?.refundPercentage).toBe(75);
  });

  it("selects the 31+ band starting exactly at 31 days, not the 15-30 band", () => {
    const rule = selectApplicableRule(standardPolicy, 31);
    expect(rule?.refundPercentage).toBe(100);
  });

  it("selects the 7-14 day band for 10 days before trip", () => {
    const rule = selectApplicableRule(standardPolicy, 10);
    expect(rule?.refundPercentage).toBe(50);
  });

  it("selects the under-7-day band for 3 days before trip", () => {
    const rule = selectApplicableRule(standardPolicy, 3);
    expect(rule?.refundPercentage).toBe(25);
  });

  it("selects the zero-refund band on the day of travel", () => {
    const rule = selectApplicableRule(standardPolicy, 0);
    expect(rule?.refundPercentage).toBe(0);
    expect(rule?.penaltyPercentage).toBe(100);
  });

  it("returns null when no band covers the given days-before-trip (e.g. a negative value, trip already started)", () => {
    const rule = selectApplicableRule(standardPolicy, -1);
    expect(rule).toBeNull();
  });

  it("returns null for an empty rule set", () => {
    expect(selectApplicableRule([], 20)).toBeNull();
  });
});

describe("computeCancellationAmounts", () => {
  it("computes a 100% refund with zero penalty", () => {
    const rule = selectApplicableRule(standardPolicy, 45)!;
    const { refundAmount, penaltyAmount } = computeCancellationAmounts(rule, 1000);
    expect(refundAmount).toBe(1000);
    expect(penaltyAmount).toBe(0);
  });

  it("computes a 75%/25% split for the 15-30 day band", () => {
    const rule = selectApplicableRule(standardPolicy, 20)!;
    const { refundAmount, penaltyAmount } = computeCancellationAmounts(rule, 1000);
    expect(refundAmount).toBe(750);
    expect(penaltyAmount).toBe(250);
  });

  it("computes zero refund for a same-day cancellation", () => {
    const rule = selectApplicableRule(standardPolicy, 0)!;
    const { refundAmount, penaltyAmount } = computeCancellationAmounts(rule, 1000);
    expect(refundAmount).toBe(0);
    expect(penaltyAmount).toBe(1000);
  });

  it("returns zero/zero when no rule matched, rather than throwing (fail-closed, no automatic refund)", () => {
    const { refundAmount, penaltyAmount } = computeCancellationAmounts(null, 1000);
    expect(refundAmount).toBe(0);
    expect(penaltyAmount).toBe(0);
  });

  it("rounds to two decimal places on an amount that doesn't divide evenly", () => {
    const rule: CancellationRuleBand = { daysBeforeMin: 0, daysBeforeMax: null, refundPercentage: 33.33, penaltyPercentage: 66.67 };
    const { refundAmount, penaltyAmount } = computeCancellationAmounts(rule, 100);
    expect(refundAmount).toBe(33.33);
    expect(penaltyAmount).toBe(66.67);
  });
});
