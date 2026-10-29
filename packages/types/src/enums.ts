/**
 * Shared enums used across services and the frontend. Keeping
 * these in one package avoids drift between, e.g., the booking
 * state machine used by the Booking service and the labels
 * rendered by the frontend.
 */

export const BOOKING_STATUSES = [
  "DRAFT",
  "PENDING_PAYMENT",
  "PAYMENT_PROCESSING",
  "CONFIRMED",
  "PARTIALLY_PAID",
  "FULLY_PAID",
  "UPCOMING",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCEL_REQUESTED",
  "CANCELLED",
  "REFUND_PENDING",
  "REFUNDED",
  "EXPIRED",
  "FAILED",
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

/**
 * Allow-list of valid transitions. The Booking service consults
 * this before ANY status write - anything not listed here throws
 * a ConflictError rather than silently mutating state.
 */
export const BOOKING_STATUS_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  DRAFT: ["PENDING_PAYMENT", "EXPIRED", "CANCELLED"],
  PENDING_PAYMENT: ["PAYMENT_PROCESSING", "EXPIRED", "CANCELLED", "FAILED"],
  PAYMENT_PROCESSING: ["CONFIRMED", "PARTIALLY_PAID", "FAILED"],
  PARTIALLY_PAID: ["FULLY_PAID", "CANCEL_REQUESTED", "CONFIRMED"],
  FULLY_PAID: ["CONFIRMED"],
  CONFIRMED: ["UPCOMING", "CANCEL_REQUESTED"],
  UPCOMING: ["IN_PROGRESS", "CANCEL_REQUESTED"],
  IN_PROGRESS: ["COMPLETED"],
  COMPLETED: [],
  CANCEL_REQUESTED: ["CANCELLED", "CONFIRMED"],
  CANCELLED: ["REFUND_PENDING"],
  REFUND_PENDING: ["REFUNDED"],
  REFUNDED: [],
  EXPIRED: [],
  FAILED: [],
};

export const PAYMENT_STATUSES = [
  "INITIATED",
  "PENDING",
  "AUTHORIZED",
  "PAID",
  "FAILED",
  "CANCELLED",
  "REFUND_PENDING",
  "REFUNDED",
  "PARTIALLY_REFUNDED",
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/**
 * "mock" is a third provider used only for local development and
 * automated testing where no real M-Pesa/Stripe sandbox
 * credentials are available. PaymentService gates it out in
 * production (see isProduction() check at the call site) - it
 * exists in this type so the validation schema and provider
 * factory can express "mock" as a legitimate, typed value rather
 * than an untyped escape hatch.
 */
export const PAYMENT_PROVIDERS = ["mpesa", "stripe", "mock"] as const;
export type PaymentProvider = (typeof PAYMENT_PROVIDERS)[number];

export const CURRENCIES = ["KES", "USD", "EUR", "GBP", "TZS", "UGX", "AED", "ZAR"] as const;
export type Currency = (typeof CURRENCIES)[number];

export const USER_ROLES = [
  "super_admin",
  "admin",
  "travel_manager",
  "destination_manager",
  "tour_operator",
  "accommodation_provider",
  "transport_provider",
  "tour_guide",
  "finance_manager",
  "customer_support",
  "marketing_manager",
  "customer",
] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const PACKAGE_TYPES = [
  "individual",
  "couple",
  "family",
  "group",
  "corporate",
  "school",
  "private",
  "custom",
  "honeymoon",
  "adventure",
  "safari",
  "beach_holiday",
  "cultural",
  "business_travel",
  "conference",
] as const;
export type PackageType = (typeof PACKAGE_TYPES)[number];

export const TRAVELER_TYPES = ["adult", "child", "infant"] as const;
export type TravelerType = (typeof TRAVELER_TYPES)[number];

export const TRANSPORT_TYPES = [
  "private_car",
  "suv",
  "van",
  "minibus",
  "tour_bus",
  "train",
  "domestic_flight",
  "international_flight",
  "boat",
  "ferry",
  "motorbike",
  "4x4_safari_vehicle",
  "self_drive",
] as const;
export type TransportType = (typeof TRANSPORT_TYPES)[number];

export const OPERATOR_STATUSES = ["pending", "approved", "rejected", "suspended"] as const;
export type OperatorStatus = (typeof OPERATOR_STATUSES)[number];

export const TENANT_STATUSES = ["active", "suspended", "trial", "cancelled"] as const;
export type TenantStatus = (typeof TENANT_STATUSES)[number];

export const NOTIFICATION_CHANNELS = ["email", "sms", "whatsapp", "push", "in_app"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const LEDGER_ENTRY_TYPES = [
  "customer_payment",
  "platform_fee",
  "operator_earning",
  "refund",
  "cancellation_penalty",
  "tax",
  "discount",
  "gateway_fee",
  "transfer_fee",
] as const;
export type LedgerEntryType = (typeof LEDGER_ENTRY_TYPES)[number];
