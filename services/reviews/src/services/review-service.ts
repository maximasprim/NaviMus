import { AuthorizationError, ConflictError, NotFoundError, ValidationError } from "@travel/types";
import { EventPublisher } from "@travel/events";
import type { CreateReviewInput, ReviewSearchQuery } from "@travel/validation";
import type { ReviewRepository } from "../repositories/review-repository.js";

export class ReviewService {
  constructor(
    private readonly repo: ReviewRepository,
    private readonly events: EventPublisher,
    private readonly resolveOperatorId: (tenantId: string, userId: string) => Promise<string>
  ) {}

  /**
   * Enforces the brief's rule: "Only customers with completed
   * bookings should be allowed to submit verified reviews." A
   * booking not owned by the caller, or not COMPLETED, is
   * rejected outright - this is the only path that creates a
   * review, so there's no way to bypass verification.
   */
  async create(tenantId: string, userId: string, input: CreateReviewInput) {
    const booking = await this.repo.findEligibleBooking(tenantId, input.bookingId, userId);
    if (!booking) {
      throw new NotFoundError("Booking");
    }
    if (booking.status !== "COMPLETED") {
      throw new ValidationError(
        `Reviews can only be submitted for completed trips (this booking is ${booking.status})`
      );
    }

    const existing = await this.repo.findExistingReview(tenantId, input.bookingId, input.subjectType, input.subjectId);
    if (existing) {
      throw new ConflictError("You've already reviewed this on this booking");
    }

    const review = await this.repo.create(tenantId, userId, input);

    await this.events.publish("review.created", {
      tenantId,
      reviewId: review.id,
      subjectType: review.subjectType,
      subjectId: review.subjectId,
      rating: review.rating,
    });

    return review;
  }

  async search(tenantId: string, query: ReviewSearchQuery) {
    const { items, total } = await this.repo.search(tenantId, query);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async listMine(tenantId: string, userId: string) {
    return this.repo.listForAuthor(tenantId, userId);
  }

  async getSummary(tenantId: string, subjectType: string, subjectId: string) {
    return this.repo.getSummaryForSubject(tenantId, subjectType, subjectId);
  }

  /**
   * Only the operator who owns the reviewed subject may respond -
   * or an admin/support role, which bypasses the ownership check
   * entirely (they're not expected to have an operator account).
   * A tour_operator role alone is NOT sufficient; role-gating at
   * the route only proves "this caller runs *some* business,"
   * not "this caller runs *this* business."
   */
  async respond(tenantId: string, reviewId: string, callerUserId: string, callerRoles: string[], response: string) {
    const review = await this.repo.findById(tenantId, reviewId);
    if (!review) throw new NotFoundError("Review");

    const isAdminOrSupport = callerRoles.some((r) => ["admin", "super_admin", "customer_support"].includes(r));
    if (!isAdminOrSupport) {
      const owningOperatorId = await this.repo.getOwningOperatorId(tenantId, review.subjectType, review.subjectId);
      if (!owningOperatorId) {
        throw new AuthorizationError("This review's subject cannot be responded to by an operator");
      }
      const callerOperatorId = await this.resolveOperatorId(tenantId, callerUserId);
      if (callerOperatorId !== owningOperatorId) {
        throw new AuthorizationError("You can only respond to reviews of your own listings");
      }
    }

    const updated = await this.repo.respond(tenantId, reviewId, response);
    return updated!;
  }

  async report(tenantId: string, reviewId: string) {
    const review = await this.repo.findById(tenantId, reviewId);
    if (!review) throw new NotFoundError("Review");
    await this.repo.report(tenantId, reviewId);
  }

  async moderate(tenantId: string, reviewId: string, status: "published" | "pending_moderation" | "removed") {
    const review = await this.repo.findById(tenantId, reviewId);
    if (!review) throw new NotFoundError("Review");
    const updated = await this.repo.moderate(tenantId, reviewId, status);
    return updated!;
  }
}
