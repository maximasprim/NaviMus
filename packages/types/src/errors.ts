/**
 * Central set of typed application errors. Every service throws
 * one of these (never a raw Error, never a raw DB error) so the
 * gateway's error-handling middleware can map them to a
 * consistent HTTP status + API envelope without inspecting
 * message strings.
 */
export class AppError extends Error {
  readonly code: string;
  readonly httpStatus: number;
  readonly details?: unknown;

  constructor(code: string, message: string, httpStatus: number, details?: unknown) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ValidationError extends AppError {
  constructor(message = "Invalid input", details?: unknown) {
    super("VALIDATION_ERROR", message, 400, details);
  }
}

export class AuthenticationError extends AppError {
  constructor(message = "Authentication required") {
    super("AUTHENTICATION_ERROR", message, 401);
  }
}

export class AuthorizationError extends AppError {
  constructor(message = "You do not have permission to perform this action") {
    super("AUTHORIZATION_ERROR", message, 403);
  }
}

export class NotFoundError extends AppError {
  constructor(resource = "Resource") {
    super("NOT_FOUND", `${resource} not found`, 404);
  }
}

export class ConflictError extends AppError {
  constructor(message = "Request conflicts with current state") {
    super("CONFLICT", message, 409);
  }
}

export class PaymentError extends AppError {
  constructor(message = "Payment could not be processed", details?: unknown) {
    super("PAYMENT_ERROR", message, 402, details);
  }
}

/**
 * Thrown when an action would exceed the tenant's plan limits (max
 * operators, max staff users, max bookings/month - see
 * packages/database/src/plan-limits.ts). 402 Payment Required is the
 * fitting, if underused, status code here: the caller isn't doing
 * anything wrong, they've simply outgrown their current plan and need
 * to upgrade (or ask you, the super_admin, to raise their limit) to
 * proceed.
 */
export class PlanLimitError extends AppError {
  constructor(message = "This action would exceed your plan's limits", details?: unknown) {
    super("PLAN_LIMIT_EXCEEDED", message, 402, details);
  }
}

export class BookingError extends AppError {
  constructor(message = "Booking could not be completed", details?: unknown) {
    super("BOOKING_ERROR", message, 409, details);
  }
}

export class AvailabilityError extends AppError {
  constructor(message = "Selected item is no longer available") {
    super("AVAILABILITY_ERROR", message, 409);
  }
}

export class ExternalServiceError extends AppError {
  constructor(service: string, message = "An upstream service failed") {
    super("EXTERNAL_SERVICE_ERROR", `${service}: ${message}`, 502);
  }
}

export class RateLimitError extends AppError {
  constructor(message = "Too many requests") {
    super("RATE_LIMIT_EXCEEDED", message, 429);
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}
