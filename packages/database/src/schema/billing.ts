import { index, jsonb, pgTable, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { idColumn } from "./_helpers.js";

/**
 * Every Stripe BILLING webhook event we have received, for idempotency and
 * audit. Deliberately not tenant-scoped (and not under RLS): the webhook
 * arrives before we know which tenant it concerns, exactly like
 * payment_webhooks. `processed_at` is set only once the event was fully
 * handled, so a crash mid-processing is retried rather than swallowed.
 */
export const billingEvents = pgTable(
  "billing_events",
  {
    id: idColumn(),
    eventId: varchar("event_id", { length: 100 }).notNull(), // Stripe evt_...
    type: varchar("type", { length: 100 }).notNull(),
    tenantId: uuid("tenant_id"), // informational; set once resolved. No FK so tenant hard-delete doesn't need to touch it.
    // applied | ignored_stale | ignored_unknown_tenant | ignored_other | rejected_* ...
    outcome: varchar("outcome", { length: 60 }),
    payload: jsonb("payload").notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    eventUnique: uniqueIndex("billing_events_event_id_unique").on(table.eventId),
    tenantIdx: index("billing_events_tenant_idx").on(table.tenantId),
  })
);
