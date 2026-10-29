import { eq, schema, type Database } from "@travel/database";
import { selectApplicableRule } from "../cancellation-rules.js";

export class CancellationPolicyRepository {
  constructor(private readonly db: Database) {}

  async getRulesForPolicy(policyId: string) {
    return this.db
      .select()
      .from(schema.cancellationRules)
      .where(eq(schema.cancellationRules.policyId, policyId));
  }

  async getDefaultPolicyForOperator(operatorId: string) {
    const [policy] = await this.db
      .select()
      .from(schema.cancellationPolicies)
      .where(eq(schema.cancellationPolicies.operatorId, operatorId))
      .limit(1);
    return policy ?? null;
  }

  /**
   * Finds the single rule band whose [daysBeforeMin, daysBeforeMax]
   * range contains `daysBeforeTrip`. The actual band-matching logic
   * lives in ../cancellation-rules.ts (selectApplicableRule) so it
   * can be unit tested without a database - see cancellation-rules.test.ts.
   */
  async findApplicableRule(policyId: string, daysBeforeTrip: number) {
    const rules = await this.getRulesForPolicy(policyId);
    return selectApplicableRule(rules, daysBeforeTrip);
  }
}
