import { AppError, ConflictError, NotFoundError, ValidationError } from "@travel/types";
import { EventPublisher } from "@travel/events";
import type {
  OperatorSearchQuery,
  RegisterOperatorInput,
  ReviewOperatorInput,
  UpdateOperatorInput,
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
      // Same CONFLICT / 409 / message as before; `details` additionally says which status, so the partner portal can
      // tailor its menu (a pending, rejected and suspended partner each see something different).
      throw new AppError("CONFLICT", `Your operator account is ${operator.status} and cannot manage listings yet`, 409, {
        operatorStatus: operator.status,
      });
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

  /** Everything the admin operator page shows: profile, staff with accounts, documents, totals and recent history. */
  async getDetail(tenantId: string, id: string) {
    const operator = await this.repo.findById(tenantId, id);
    if (!operator) throw new NotFoundError("Operator");
    const [staff, documents, stats, history] = await Promise.all([
      this.repo.listStaffWithUsers(id),
      this.repo.listDocuments(id),
      this.repo.stats(id),
      this.repo.history(id),
    ]);
    return { ...operator, staff, documents, stats, history };
  }

  async updateProfile(tenantId: string, id: string, patch: UpdateOperatorInput, actorUserId: string) {
    const updated = await this.repo.updateProfile(tenantId, id, patch);
    if (!updated) throw new NotFoundError("Operator");
    await this.repo.writeAudit({
      tenantId,
      actorUserId,
      action: "operator.updated",
      resourceId: id,
      metadata: { fields: Object.keys(patch) },
    });
    return updated;
  }

  /** Suspended -> approved again; rejected -> back to pending so it can be reviewed afresh. */
  async reinstate(tenantId: string, id: string, actorUserId: string) {
    const operator = await this.repo.findById(tenantId, id);
    if (!operator) throw new NotFoundError("Operator");
    if (operator.status !== "suspended" && operator.status !== "rejected") {
      throw new ConflictError(`Only suspended or rejected operators can be reinstated (this one is ${operator.status})`);
    }
    const next = operator.status === "suspended" ? "approved" : "pending";
    const updated = await this.repo.setStatus(tenantId, id, next);
    if (next === "approved") await this.repo.grantOperatorRoleToStaff(id);
    await this.repo.writeAudit({
      tenantId,
      actorUserId,
      action: next === "approved" ? "operator.reinstated" : "operator.reopened",
      resourceId: id,
      metadata: { from: operator.status },
    });
    return updated!;
  }

  async remove(tenantId: string, id: string, actorUserId: string) {
    const removed = await this.repo.softDelete(tenantId, id);
    if (!removed) throw new NotFoundError("Operator");
    await this.repo.writeAudit({
      tenantId,
      actorUserId,
      action: "operator.deleted",
      resourceId: id,
      metadata: { businessName: removed.businessName },
    });
    return removed;
  }

  async removeStaff(tenantId: string, operatorId: string, userId: string, actorUserId: string) {
    const operator = await this.repo.findById(tenantId, operatorId);
    if (!operator) throw new NotFoundError("Operator");
    const removed = await this.repo.removeStaff(operatorId, userId);
    if (!removed) throw new NotFoundError("Staff member");
    await this.repo.writeAudit({ tenantId, actorUserId, action: "operator.staff_removed", resourceId: operatorId, metadata: { userId } });
  }

  listDeleted(tenantId: string) {
    return this.repo.listDeleted(tenantId);
  }

  async restore(tenantId: string, id: string, actorUserId: string) {
    const row = await this.repo.restore(tenantId, id);
    if (!row) throw new NotFoundError("Deleted operator");
    await this.repo.writeAudit({ tenantId, actorUserId, action: "operator.restored", resourceId: id, metadata: { businessName: row.businessName } });
    return row;
  }
}
