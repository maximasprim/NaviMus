import { describe, it, expect, vi } from "vitest";
import { AuthorizationError, NotFoundError } from "@travel/types";
import { ReviewService } from "./review-service.js";
import type { ReviewRepository } from "../repositories/review-repository.js";
import type { EventPublisher } from "@travel/events";

type ReviewRow = {
  id: string;
  subjectType: string;
  subjectId: string;
  rating: number;
};

function review(overrides: Partial<ReviewRow> = {}): ReviewRow {
  return { id: "review-1", subjectType: "package", subjectId: "pkg-1", rating: 5, ...overrides };
}

function fakeRepo(overrides: Partial<Record<keyof ReviewRepository, unknown>> = {}): ReviewRepository {
  return {
    findById: vi.fn().mockResolvedValue(review()),
    getOwningOperatorId: vi.fn().mockResolvedValue("op-1"),
    respond: vi.fn().mockResolvedValue({ ...review(), operatorResponse: "Thanks!" }),
    findEligibleBooking: vi.fn(),
    findExistingReview: vi.fn(),
    create: vi.fn(),
    search: vi.fn(),
    report: vi.fn(),
    moderate: vi.fn(),
    getSummaryForSubject: vi.fn(),
    ...overrides,
  } as unknown as ReviewRepository;
}

const TENANT_ID = "tenant-1";

function fakeEvents(): EventPublisher {
  return { publish: vi.fn().mockResolvedValue(undefined), close: vi.fn() } as unknown as EventPublisher;
}

describe("ReviewService.respond", () => {
  it("allows the owning operator to respond", async () => {
    const repo = fakeRepo({ getOwningOperatorId: vi.fn().mockResolvedValue("op-1") });
    const resolveOperatorId = vi.fn().mockResolvedValue("op-1");
    const service = new ReviewService(repo, fakeEvents(), resolveOperatorId);

    const result = await service.respond(TENANT_ID, "review-1", "user-1", ["tour_operator"], "Thanks for staying!");

    expect(result.operatorResponse).toBe("Thanks!");
    expect(resolveOperatorId).toHaveBeenCalledWith(TENANT_ID, "user-1");
  });

  it("rejects a tour_operator who doesn't own the reviewed subject", async () => {
    const repo = fakeRepo({ getOwningOperatorId: vi.fn().mockResolvedValue("op-1") });
    const resolveOperatorId = vi.fn().mockResolvedValue("op-2"); // a different operator
    const service = new ReviewService(repo, fakeEvents(), resolveOperatorId);

    await expect(
      service.respond(TENANT_ID, "review-1", "user-2", ["tour_operator"], "Not my listing")
    ).rejects.toThrow(AuthorizationError);
  });

  it("rejects a tour_operator responding to a subject type with no operator ownership", async () => {
    const repo = fakeRepo({
      findById: vi.fn().mockResolvedValue(review({ subjectType: "destination" })),
      getOwningOperatorId: vi.fn().mockResolvedValue(null),
    });
    const resolveOperatorId = vi.fn();
    const service = new ReviewService(repo, fakeEvents(), resolveOperatorId);

    await expect(
      service.respond(TENANT_ID, "review-1", "user-1", ["tour_operator"], "Nice place")
    ).rejects.toThrow(AuthorizationError);
    // Never even needs to resolve the caller's operator - ownership is
    // undefined for this subject type regardless of who's asking.
    expect(resolveOperatorId).not.toHaveBeenCalled();
  });

  it("lets an admin respond without any operator-ownership check", async () => {
    const repo = fakeRepo({ getOwningOperatorId: vi.fn() });
    const resolveOperatorId = vi.fn();
    const service = new ReviewService(repo, fakeEvents(), resolveOperatorId);

    const result = await service.respond(TENANT_ID, "review-1", "admin-1", ["admin"], "Thanks for the feedback");

    expect(result.operatorResponse).toBe("Thanks!");
    expect(resolveOperatorId).not.toHaveBeenCalled();
    expect(repo.getOwningOperatorId).not.toHaveBeenCalled();
  });

  it("lets customer_support respond without any operator-ownership check", async () => {
    const repo = fakeRepo();
    const service = new ReviewService(repo, fakeEvents(), vi.fn());

    await expect(
      service.respond(TENANT_ID, "review-1", "support-1", ["customer_support"], "We're looking into this")
    ).resolves.toBeDefined();
  });

  it("throws NotFoundError for a review that doesn't exist", async () => {
    const repo = fakeRepo({ findById: vi.fn().mockResolvedValue(null) });
    const service = new ReviewService(repo, fakeEvents(), vi.fn());

    await expect(service.respond(TENANT_ID, "missing", "user-1", ["admin"], "x")).rejects.toThrow(NotFoundError);
  });
});
