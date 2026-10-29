import { describe, it, expect, vi } from "vitest";
import { ConflictError, NotFoundError } from "@travel/types";
import type { PlanLimitChecker } from "@travel/database";
import { OperatorService } from "./operator-service.js";
import type { OperatorRepository } from "../repositories/operator-repository.js";
import type { EventPublisher } from "@travel/events";

type OperatorRow = {
  id: string;
  businessName: string;
  status: "pending" | "approved" | "rejected" | "suspended";
  contactEmail: string;
};

function operator(overrides: Partial<OperatorRow> = {}): OperatorRow {
  return {
    id: "op-1",
    businessName: "Rift Valley Safaris",
    status: "pending",
    contactEmail: "ops@example.test",
    ...overrides,
  };
}

function fakeRepo(overrides: Partial<Record<keyof OperatorRepository, unknown>> = {}): OperatorRepository {
  return {
    findById: vi.fn().mockResolvedValue(operator()),
    findOperatorForUser: vi.fn().mockResolvedValue(null),
    register: vi.fn(),
    review: vi.fn().mockImplementation((_tenantId: string, id: string, decision: string) =>
      Promise.resolve(operator({ id, status: decision as any }))
    ),
    suspend: vi.fn(),
    setCommissionRate: vi.fn(),
    addStaff: vi.fn(),
    grantOperatorRoleToStaff: vi.fn(),
    listStaff: vi.fn().mockResolvedValue([]),
    addDocument: vi.fn(),
    listDocuments: vi.fn().mockResolvedValue([]),
    reviewDocument: vi.fn(),
    search: vi.fn(),
    ...overrides,
  } as unknown as OperatorRepository;
}

const TENANT_ID = "tenant-1";

function fakePlanLimits(): PlanLimitChecker {
  return {
    checkOperatorLimit: vi.fn().mockResolvedValue(undefined),
    checkStaffLimit: vi.fn().mockResolvedValue(undefined),
    checkBookingLimit: vi.fn().mockResolvedValue(undefined),
  };
}

function fakeEvents(): EventPublisher {
  return { publish: vi.fn().mockResolvedValue(undefined), close: vi.fn() } as unknown as EventPublisher;
}

describe("OperatorService.review", () => {
  it("approves a pending operator and publishes operator.approved", async () => {
    const repo = fakeRepo({ findById: vi.fn().mockResolvedValue(operator({ status: "pending" })) });
    const events = fakeEvents();
    const service = new OperatorService(repo, events, fakePlanLimits());

    const result = await service.review(TENANT_ID, "op-1", { decision: "approved" }, "admin-1");

    expect(result.status).toBe("approved");
    expect(events.publish).toHaveBeenCalledWith(
      "operator.approved",
      expect.objectContaining({ operatorId: "op-1" })
    );
  });

  it("publishes operator.rejected with the given reason, not operator.approved", async () => {
    const repo = fakeRepo({ findById: vi.fn().mockResolvedValue(operator({ status: "pending" })) });
    const events = fakeEvents();
    const service = new OperatorService(repo, events, fakePlanLimits());

    await service.review(TENANT_ID, "op-1", { decision: "rejected", reason: "Missing tax certificate" }, "admin-1");

    expect(events.publish).toHaveBeenCalledWith(
      "operator.rejected",
      expect.objectContaining({ reason: "Missing tax certificate" })
    );
    expect(events.publish).not.toHaveBeenCalledWith("operator.approved", expect.anything());
  });

  it("refuses to re-review an operator that isn't pending", async () => {
    const repo = fakeRepo({ findById: vi.fn().mockResolvedValue(operator({ status: "approved" })) });
    const service = new OperatorService(repo, fakeEvents(), fakePlanLimits());

    await expect(service.review(TENANT_ID, "op-1", { decision: "approved" }, "admin-1")).rejects.toThrow(ConflictError);
  });

  it("throws NotFoundError for an operator that doesn't exist", async () => {
    const repo = fakeRepo({ findById: vi.fn().mockResolvedValue(null) });
    const service = new OperatorService(repo, fakeEvents(), fakePlanLimits());

    await expect(service.review(TENANT_ID, "missing", { decision: "approved" }, "admin-1")).rejects.toThrow(NotFoundError);
  });
});

describe("OperatorService.resolveOperatorForUser", () => {
  it("returns the operator when the user is staff of an approved operator", async () => {
    const repo = fakeRepo({ findOperatorForUser: vi.fn().mockResolvedValue(operator({ status: "approved" })) });
    const service = new OperatorService(repo, fakeEvents(), fakePlanLimits());

    const result = await service.resolveOperatorForUser(TENANT_ID, "user-1");
    expect(result.id).toBe("op-1");
  });

  it("throws NotFoundError when the user has no operator", async () => {
    const repo = fakeRepo({ findOperatorForUser: vi.fn().mockResolvedValue(null) });
    const service = new OperatorService(repo, fakeEvents(), fakePlanLimits());

    await expect(service.resolveOperatorForUser(TENANT_ID, "user-1")).rejects.toThrow(NotFoundError);
  });

  it("refuses to resolve an operator that is still pending", async () => {
    const repo = fakeRepo({ findOperatorForUser: vi.fn().mockResolvedValue(operator({ status: "pending" })) });
    const service = new OperatorService(repo, fakeEvents(), fakePlanLimits());

    await expect(service.resolveOperatorForUser(TENANT_ID, "user-1")).rejects.toThrow(ConflictError);
  });

  it("refuses to resolve a suspended operator", async () => {
    const repo = fakeRepo({ findOperatorForUser: vi.fn().mockResolvedValue(operator({ status: "suspended" })) });
    const service = new OperatorService(repo, fakeEvents(), fakePlanLimits());

    await expect(service.resolveOperatorForUser(TENANT_ID, "user-1")).rejects.toThrow(ConflictError);
  });
});

describe("OperatorService.register", () => {
  it("refuses to register a second operator for a user who is already staff of one", async () => {
    const repo = fakeRepo({ findOperatorForUser: vi.fn().mockResolvedValue(operator()) });
    const service = new OperatorService(repo, fakeEvents(), fakePlanLimits());

    await expect(
      service.register(TENANT_ID, "user-1", { businessName: "New Co", contactEmail: "a@b.test" })
    ).rejects.toThrow(ConflictError);
  });
});
