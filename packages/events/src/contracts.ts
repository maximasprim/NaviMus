/**
 * Versioned domain event contracts. Every producer and consumer
 * imports the payload type from here rather than inlining an
 * object shape - this is what lets Redis Streams/BullMQ be
 * swapped for Kafka/RabbitMQ later without touching the events
 * themselves, per the Events Architecture in the design doc.
 */

export interface UserCreatedEvent {
  userId: string;
  tenantId: string; // added for multi-tenancy: lets consumers (e.g. notifications) resolve tenant-scoped templates/settings
  email: string;
}

export interface BookingCreatedEvent {
  tenantId: string;
  bookingId: string;
  userId: string;
  contactEmail: string;
  contactPhone: string;
  packageId: string | null;
  travelDate: string;
  totalAmount: string;
  currency: string;
}

export interface BookingConfirmedEvent {
  tenantId: string;
  bookingId: string;
  userId: string;
  contactEmail: string;
  contactPhone: string;
  travelDate: string;
}

export interface BookingCancelledEvent {
  tenantId: string;
  bookingId: string;
  userId: string;
  contactEmail: string;
  contactPhone: string;
  refundAmount: string;
  currency: string;
}

export interface PaymentInitiatedEvent {
  tenantId: string;
  paymentId: string;
  bookingId: string;
  provider: string;
  amount: string;
  currency: string;
}

export interface PaymentCompletedEvent {
  tenantId: string;
  paymentId: string;
  bookingId: string;
  contactEmail: string;
  contactPhone: string;
  amount: string;
  currency: string;
}

export interface PaymentFailedEvent {
  tenantId: string;
  paymentId: string;
  bookingId: string;
  contactEmail: string;
  reason?: string;
}

export interface RefundInitiatedEvent {
  tenantId: string;
  bookingId: string;
  contactEmail: string;
  amount: string;
  currency: string;
}

export interface RefundCompletedEvent {
  tenantId: string;
  bookingId: string;
  contactEmail: string;
  amount: string;
  currency: string;
}

export interface ReviewCreatedEvent {
  tenantId: string;
  reviewId: string;
  subjectType: string;
  subjectId: string;
  rating: number;
}

export interface TripReminderEvent {
  tenantId: string;
  bookingId: string;
  contactEmail: string;
  contactPhone: string;
  travelDate: string;
  daysBeforeTrip: number;
}

export interface OperatorApprovedEvent {
  tenantId: string;
  operatorId: string;
  businessName: string;
  contactEmail: string;
}

export interface OperatorRejectedEvent {
  tenantId: string;
  operatorId: string;
  businessName: string;
  contactEmail: string;
  reason?: string;
}

export interface PasswordResetRequestedEvent {
  tenantId: string;
  userId: string;
  email: string;
  resetToken: string;
  expiresAt: string;
}

export interface EmailVerificationRequestedEvent {
  tenantId: string;
  userId: string;
  email: string;
  verificationToken: string;
  expiresAt: string;
}

/** Maps each event name to its payload type - the source of truth for both ends of the queue. */
export interface DomainEventMap {
  "user.created": UserCreatedEvent;
  "booking.created": BookingCreatedEvent;
  "booking.confirmed": BookingConfirmedEvent;
  "booking.cancelled": BookingCancelledEvent;
  "payment.initiated": PaymentInitiatedEvent;
  "payment.completed": PaymentCompletedEvent;
  "payment.failed": PaymentFailedEvent;
  "refund.initiated": RefundInitiatedEvent;
  "refund.completed": RefundCompletedEvent;
  "review.created": ReviewCreatedEvent;
  "operator.approved": OperatorApprovedEvent;
  "operator.rejected": OperatorRejectedEvent;
  "trip.reminder": TripReminderEvent;
  "user.password_reset_requested": PasswordResetRequestedEvent;
  "user.email_verification_requested": EmailVerificationRequestedEvent;
}

export type DomainEventName = keyof DomainEventMap;
