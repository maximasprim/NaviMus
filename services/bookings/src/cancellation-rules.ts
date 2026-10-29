export interface CancellationRuleBand {
  daysBeforeMin: number;
  daysBeforeMax: number | null; // null = unbounded ("30+ days before")
  refundPercentage: string | number;
  penaltyPercentage: string | number;
}

/**
 * Finds the single rule band whose [daysBeforeMin, daysBeforeMax]
 * range contains `daysBeforeTrip`. Pulled out of
 * CancellationPolicyRepository so the band-matching logic - the
 * part that actually determines how much money changes hands on a
 * cancellation - can be unit tested without a database.
 */
export function selectApplicableRule<T extends CancellationRuleBand>(
  rules: T[],
  daysBeforeTrip: number
): T | null {
  return (
    rules.find((rule) => {
      const { daysBeforeMin: min, daysBeforeMax: max } = rule;
      if (max === null) return daysBeforeTrip >= min;
      return daysBeforeTrip >= min && daysBeforeTrip <= max;
    }) ?? null
  );
}

/**
 * Computes refund/penalty amounts from a matched rule and the
 * booking total. Kept alongside selectApplicableRule since both
 * are pure, deterministic, and worth testing directly against the
 * cancellation-policy examples in the engineering brief.
 */
export function computeCancellationAmounts(
  rule: CancellationRuleBand | null,
  totalAmount: number
): { refundAmount: number; penaltyAmount: number } {
  if (!rule) return { refundAmount: 0, penaltyAmount: 0 };
  const refundAmount = Math.round(totalAmount * (Number(rule.refundPercentage) / 100) * 100) / 100;
  const penaltyAmount = Math.round(totalAmount * (Number(rule.penaltyPercentage) / 100) * 100) / 100;
  return { refundAmount, penaltyAmount };
}
