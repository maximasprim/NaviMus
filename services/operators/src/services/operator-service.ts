import { ConflictError, NotFoundError, ValidationError } from "@travel/types";
import { EventPublisher } from "@travel/events";
import type {
  OperatorSearchQuery,
  RegisterOperatorInput,
  ReviewOperatorInput,
} from "@travel/validation";
import type { OperatorRepository } from "../repositories/operator-repository.js";

/**
 * Injected rather than importing @travel/database's plan-limit
 * functions and a raw Database instance directly into this service -
 * matches the existing pattern of injecting resolveOperatorForUser-style
 * functions elsewhere in this codebase. Keeps this service testable
 * with plain fakes (see operator-service.test.ts) instead of needing a
 * working drizzle-shaped mock, and keeps OperatorService itself
 * decoupled from exactly how plan limits are computed.
 */
export interface PlanLimitChecker {
  /** Throws PlanLimitError if adding one more operator would exceed the tenant's plan. */
  checkOperatorLimit(tenantId: string): Promise<void>;
  /** Throws PlanLimitError if adding one more staff user would exceed the tenant's plan. */
  checkStaffLimit(tenantId: string): Promise<void>;
}

export class OperatorService {
  constructor(
    private readonly repo: OperatorRepository,
    private readonly events: EventPublisher,
    private readonly planLimits: PlanLimitChecker
  ) {}

  async register(tenantId: string, userId: string, input: RegisterOperatorInput) {
    const existing = await this.repo.findOperatorForUser(tenantId, userId);
    if (existing) {
      throw new ConflictError("This account is already staff of an operator");
    }

    await this.planLimits.checkOperatorLimit(tenantId);

    return this.repo.register(tenantId, userId, input);
  }

  async search(tenantId: string, query: OperatorSearchQuery) {
    const { items, total } = await this.repo.search(tenantId, query);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async getById(tenantId: string, id: string) {
    const operator = await this.repo.findById(tenantId, id);
    if (!operator) throw new NotFoundError("Operator");
    const [staff, documents] = await Promise.all([this.repo.listStaff(id), this.repo.listDocuments(id)]);
    return { ...operator, staff, documents };
  }

  /**
   * Server-side resolution of "which operator is this authenticated
   * user allowed to act as" - the function every other service's
   * write routes should call instead of using the caller's own
   * user id as the operatorId (see the `NOTE:` comments those
   * routes currently carry).
   */
  async resolveOperatorForUser(tenantId: string, userId: string) {
    const operator = await this.repo.findOperatorForUser(tenantId, userId);
    if (!operator) {
      throw new NotFoundError("Operator account for this user");
    }
    if (operator.status !== "approved") {
      throw new ConflictError(`Your operator account is ${operator.status} and cannot manage listings yet`);
    }
    return operator;
  }

  /**
   * Admin approval decision. Only admins call this (enforced at the
   * route layer via requireRoles) - approving/rejecting is what
   * unlocks (or keeps locked) every write path that depends on
   * resolveOperatorForUser above.
   */
  async review(tenantId: string, operatorId: string, input: ReviewOperatorInput, reviewerUserId: string) {
    const operator = await this.repo.findById(tenantId, operatorId);
    if (!operator) throw new NotFoundError("Operator");
    if (operator.status !== "pending") {
      throw new ConflictError(`Operator is already ${operator.status}`);
    }

    const updated = await this.repo.review(tenantId, operatorId, input.decision, reviewerUserId);

    if (input.decision === "approved") {
      await this.repo.grantOperatorRoleToStaff(operatorId);
      await this.events.publish("operator.approved", {
        tenantId,
        operatorId: operator.id,
        businessName: operator.businessName,
        contactEmail: operator.contactEmail,
      });
    } else {
      await this.events.publish("operator.rejected", {
        tenantId,
        operatorId: operator.id,
        businessName: operator.businessName,
        contactEmail: operator.contactEmail,
        reason: input.reason,
      });
    }

    return updated!;
  }

  async suspend(tenantId: string, operatorId: string) {
    const operator = await this.repo.findById(tenantId, operatorId);
    if (!operator) throw new NotFoundError("Operator");
    return this.repo.suspend(tenantId, operatorId);
  }

  async setCommissionRate(tenantId: string, operatorId: string, percent: number) {
    const operator = await this.repo.findById(tenantId, operatorId);
    if (!operator) throw new NotFoundError("Operator");
    return this.repo.setCommissionRate(tenantId, operatorId, percent);
  }

  async addStaff(tenantId: string, operatorId: string, userId: string, title?: string) {
    const operator = await this.repo.findById(tenantId, operatorId);
    if (!operator) throw new NotFoundError("Operator");
    const existing = await this.repo.findOperatorForUser(tenantId, userId);
    if (existing) throw new ConflictError("That user is already staff of an operator");

    await this.planLimits.checkStaffLimit(tenantId);

    const staffRow = await this.repo.addStaff(operatorId, userId, title);
    // If the operator is already approved, the new staff member needs the
    // role immediately too - grantOperatorRoleToStaff grants to ALL current
    // staff, which is a safe no-op for the existing members already holding it.
    if (operator.status === "approved") {
      await this.repo.grantOperatorRoleToStaff(operatorId);
    }
    return staffRow;
  }

  async submitDocument(tenantId: string, operatorId: string, documentType: string, storageKey: string) {
    const operator = await this.repo.findById(tenantId, operatorId);
    if (!operator) throw new NotFoundError("Operator");
    return this.repo.addDocument(operatorId, documentType, storageKey);
  }

  async reviewDocument(tenantId: string, documentId: string, decision: "approved" | "rejected", reviewerUserId: string) {
    const updated = await this.repo.reviewDocument(tenantId, documentId, decision, reviewerUserId);
    if (!updated) throw new NotFoundError("Operator document");
    return updated;
  }

  async listDocuments(tenantId: string, operatorId: string) {
    const operator = await this.repo.findById(tenantId, operatorId);
    if (!operator) throw new NotFoundError("Operator");
    return this.repo.listDocuments(operatorId);
  }
}
