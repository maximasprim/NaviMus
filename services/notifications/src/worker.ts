import { env } from "@travel/config";
import { createServiceLogger } from "@travel/logger";
import { and, createDb, eq, isNull, schema } from "@travel/database";
import { EventPublisher, subscribe } from "@travel/events";
import { TemplateRepository } from "./templates.js";
import { NotificationLogRepository } from "./repositories/notification-log-repository.js";
import { NotificationService } from "./services/notification-service.js";

const logger = createServiceLogger("notifications-worker");
const db = createDb(env.DATABASE_URL);
const events = new EventPublisher();

const templates = new TemplateRepository(db);
const logs = new NotificationLogRepository(db);
const notificationService = new NotificationService(templates, logs);

const DEFAULT_REMINDER_OFFSETS_DAYS = [30, 7, 3, 1];

/**
 * Reminder offsets are configurable via system_settings (per the
 * "make reminder schedules configurable" requirement) rather than
 * hardcoded - admins can change `reminder_offsets_days` without a
 * deploy. Falls back to the default list if the setting doesn't
 * exist yet.
 */
async function getReminderOffsetsDays(tenantId: string): Promise<number[]> {
  const [tenantRow] = await db
    .select()
    .from(schema.systemSettings)
    .where(and(eq(schema.systemSettings.tenantId, tenantId), eq(schema.systemSettings.key, "reminder_offsets_days")))
    .limit(1);
  const fromValue = (value: unknown): number[] | null =>
    Array.isArray(value) && value.every((n) => typeof n === "number") ? (value as number[]) : null;

  if (tenantRow) {
    const parsed = fromValue(tenantRow.value);
    if (parsed) return parsed;
  }

  const [defaultRow] = await db
    .select()
    .from(schema.systemSettings)
    .where(and(isNull(schema.systemSettings.tenantId), eq(schema.systemSettings.key, "reminder_offsets_days")))
    .limit(1);
  return (defaultRow && fromValue(defaultRow.value)) ?? DEFAULT_REMINDER_OFFSETS_DAYS;
}

/**
 * One BullMQ Worker per event name, per the events package
 * convention. Each handler is intentionally small: resolve the
 * variables that matter for that event, call notify(), done. The
 * NotificationService is what actually looks up the template and
 * sends - this file only maps "what happened" to "what to send".
 */

subscribe("booking.created", async (event) => {
  await notificationService.notify({
    tenantId: event.tenantId,
    templateKey: "booking.created",
    channel: "email",
    recipient: event.contactEmail,
    userId: event.userId,
    variables: {
      bookingId: event.bookingId.slice(0, 8),
      travelDate: event.travelDate,
      totalAmount: event.totalAmount,
      currency: event.currency,
    },
  });
});

subscribe("payment.completed", async (event) => {
  await notificationService.notify({
    tenantId: event.tenantId,
    templateKey: "payment.completed",
    channel: "email",
    recipient: event.contactEmail,
    variables: { bookingId: event.bookingId.slice(0, 8), amount: event.amount, currency: event.currency },
  });
  // Also confirm via SMS where a phone number is available - this is the
  // "booking confirmed" moment travelers most want a fast channel for.
  if (event.contactPhone) {
    await notificationService.notify({
      tenantId: event.tenantId,
      templateKey: "booking.confirmed",
      channel: "sms",
      recipient: event.contactPhone,
      variables: { bookingId: event.bookingId.slice(0, 8) },
    });
  }
});

subscribe("payment.failed", async (event) => {
  await notificationService.notify({
    tenantId: event.tenantId,
    templateKey: "payment.failed",
    channel: "email",
    recipient: event.contactEmail,
    variables: { bookingId: event.bookingId.slice(0, 8), reason: event.reason ?? "Payment could not be completed" },
  });
});

subscribe("booking.cancelled", async (event) => {
  await notificationService.notify({
    tenantId: event.tenantId,
    templateKey: "booking.cancelled",
    channel: "email",
    recipient: event.contactEmail,
    userId: event.userId,
    variables: { bookingId: event.bookingId.slice(0, 8), refundAmount: event.refundAmount, currency: event.currency },
  });
});

subscribe("refund.completed", async (event) => {
  await notificationService.notify({
    tenantId: event.tenantId,
    templateKey: "refund.completed",
    channel: "email",
    recipient: event.contactEmail,
    variables: { bookingId: event.bookingId.slice(0, 8), amount: event.amount, currency: event.currency },
  });
});

subscribe("operator.approved", async (event) => {
  await notificationService.notify({
    tenantId: event.tenantId,
    templateKey: "operator.approved",
    channel: "email",
    recipient: event.contactEmail,
    variables: { businessName: event.businessName },
  });
});

subscribe("operator.rejected", async (event) => {
  await notificationService.notify({
    tenantId: event.tenantId,
    templateKey: "operator.rejected",
    channel: "email",
    recipient: event.contactEmail,
    variables: { businessName: event.businessName, reason: event.reason ?? "Please contact support for details" },
  });
});

/**
 * Schedules the 30/7/3/1-day-before reminders (offsets configurable
 * via system_settings) the moment a booking is fully confirmed.
 * Each reminder is its own delayed BullMQ job with a stable jobId
 * (`reminder:{bookingId}:{offsetDays}`) - re-processing this handler
 * for the same booking (BullMQ's at-least-once delivery) schedules
 * the same jobs again rather than duplicating them, since BullMQ
 * treats adding a job with an existing jobId as a no-op.
 */
subscribe("booking.confirmed", async (event) => {
  const offsets = await getReminderOffsetsDays(event.tenantId);
  const travelDateMs = new Date(`${event.travelDate}T09:00:00Z`).getTime(); // fixed local-morning send time

  for (const daysBeforeTrip of offsets) {
    const sendAtMs = travelDateMs - daysBeforeTrip * 24 * 60 * 60 * 1000;
    const delayMs = sendAtMs - Date.now();
    if (delayMs <= 0) continue; // this offset has already passed - never schedule a reminder in the past

    await events.publish(
      "trip.reminder",
      {
        tenantId: event.tenantId,
        bookingId: event.bookingId,
        contactEmail: event.contactEmail,
        contactPhone: event.contactPhone,
        travelDate: event.travelDate,
        daysBeforeTrip,
      },
      { delayMs, jobId: `reminder:${event.bookingId}:${daysBeforeTrip}` }
    );
  }
});

subscribe("trip.reminder", async (event) => {
  await notificationService.notify({
    tenantId: event.tenantId,
    templateKey: "trip.reminder",
    channel: "email",
    recipient: event.contactEmail,
    variables: { travelDate: event.travelDate, daysBeforeTrip: event.daysBeforeTrip },
  });
  if (event.contactPhone) {
    await notificationService.notify({
      tenantId: event.tenantId,
      templateKey: "trip.reminder",
      channel: "sms",
      recipient: event.contactPhone,
      variables: { daysBeforeTrip: event.daysBeforeTrip },
    });
  }
});

logger.info("Notifications worker started - listening for booking/payment domain events");

subscribe("user.password_reset_requested", async (event) => {
  const resetUrl = `${env.FRONTEND_URL}/reset-password?token=${event.resetToken}`;
  await notificationService.notify({
    tenantId: event.tenantId,
    templateKey: "user.password_reset_requested",
    channel: "email",
    recipient: event.email,
    userId: event.userId,
    variables: { resetUrl, expiresAt: event.expiresAt },
  });
});

subscribe("user.email_verification_requested", async (event) => {
  const verificationUrl = `${env.FRONTEND_URL}/verify-email?token=${event.verificationToken}`;
  await notificationService.notify({
    tenantId: event.tenantId,
    templateKey: "user.email_verification_requested",
    channel: "email",
    recipient: event.email,
    userId: event.userId,
    variables: { verificationUrl, expiresAt: event.expiresAt },
  });
});
