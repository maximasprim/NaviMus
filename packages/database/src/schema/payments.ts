import { boolean, index, jsonb, numeric, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { idColumn, tenantIdColumn, timestampColumns } from "./_helpers.js";
import { bookings } from "./bookings.js";
import { tenants } from "./tenants.js";

export const payments = pgTable(
  "payments",
  {
    id: idColumn(),
    tenantId: tenantIdColumn().references(() => tenants.id, { onDelete: "restrict" }),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "restrict" }),
    provider: varchar("provider", { length: 20 }).notNull(), // mpesa|stripe
    // See PAYMENT_STATUSES in @travel/types.
    status: varchar("status", { length: 20 }).notNull().default("INITIATED"),
    originalAmount: numeric("original_amount", { precision: 12, scale: 2 }).notNull(),
    originalCurrency: varchar("original_currency", { length: 3 }).notNull(),
    exchangeRate: numeric("exchange_rate", { precision: 18, scale: 8 }).default("1.00000000"),
    baseCurrencyAmount: numeric("base_currency_amount", { precision: 12, scale: 2 }).notNull(),
    baseCurrency: varchar("base_currency", { length: 3 }).notNull().default("USD"),
    idempotencyKey: varchar("idempotency_key", { length: 128 }).notNull(),
    // The provider's own receipt for the money movement (M-Pesa receipt
    // number, Stripe PaymentIntent id). Set when the payment is confirmed.
    // Needed for M-Pesa reversals, which are keyed by receipt number
    // rather than by the CheckoutRequestID we store on payment_transactions.
    providerReceipt: varchar("provider_receipt", { length: 100 }),
    ...timestampColumns,
  },
  (table) => ({
    tenantIdempotencyUnique: uniqueIndex("payments_tenant_idempotency_unique").on(
      table.tenantId,
      table.idempotencyKey
    ),
    tenantIdx: index("payments_tenant_idx").on(table.tenantId),
    bookingIdx: index("payments_booking_idx").on(table.bookingId),
    statusIdx: index("payments_status_idx").on(table.status),
  })
);

export const paymentTransactions = pgTable(
  "payment_transactions",
  {
    id: idColumn(),
    paymentId: uuid("payment_id")
      .notNull()
      .references(() => payments.id, { onDelete: "cascade" }),
    providerReference: varchar("provider_reference", { length: 200 }).notNull(), // e.g. Mpesa CheckoutRequestID / Stripe PaymentIntent id
    rawPayload: jsonb("raw_payload"), // exact provider response, for reconciliation/audit
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    providerRefUnique: uniqueIndex("payment_transactions_provider_ref_unique").on(table.providerReference),
    paymentIdx: index("payment_transactions_payment_idx").on(table.paymentId),
  })
);

/**
 * Every inbound webhook is recorded here BEFORE being acted on.
 * `eventId` uniqueness gives free idempotency - a replayed webhook
 * from the provider is a no-op on the second delivery.
 */
export const paymentWebhooks = pgTable(
  "payment_webhooks",
  {
    id: idColumn(),
    provider: varchar("provider", { length: 20 }).notNull(),
    eventId: varchar("event_id", { length: 200 }).notNull(),
    signatureVerified: boolean("signature_verified").notNull().default(false),
    payload: jsonb("payload").notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    providerEventUnique: uniqueIndex("payment_webhooks_provider_event_unique").on(table.provider, table.eventId),
  })
);

export const paymentRefunds = pgTable(
  "payment_refunds",
  {
    id: idColumn(),
    paymentId: uuid("payment_id")
      .notNull()
      .references(() => payments.id, { onDelete: "restrict" }),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("REFUND_PENDING"),
    reason: text("reason"),
    providerReference: varchar("provider_reference", { length: 200 }),
    ...timestampColumns,
  },
  (table) => ({
    paymentIdx: index("payment_refunds_payment_idx").on(table.paymentId),
  })
);

/**
 * Immutable double-entry-style ledger. Every financial event -
 * customer payment, platform fee, operator earning, refund,
 * penalty, tax - is a new row here. Corrections are new offsetting
 * rows, never UPDATEs or DELETEs (rule #enforced in app layer:
 * the repository for this table exposes insert only, no update).
 */
export const ledgerEntries = pgTable(
  "ledger_entries",
  {
    id: idColumn(),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "restrict" }),
    paymentId: uuid("payment_id").references(() => payments.id),
    // customer_payment|platform_fee|operator_earning|refund|cancellation_penalty|tax|discount|gateway_fee|transfer_fee
    entryType: varchar("entry_type", { length: 30 }).notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(), // signed: positive = credit, negative = debit
    currency: varchar("currency", { length: 3 }).notNull(),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    bookingIdx: index("ledger_entries_booking_idx").on(table.bookingId),
    typeIdx: index("ledger_entries_type_idx").on(table.entryType),
  })
);

export const paymentsRelations = relations(payments, ({ one, many }) => ({
  tenant: one(tenants, { fields: [payments.tenantId], references: [tenants.id] }),
  booking: one(bookings, { fields: [payments.bookingId], references: [bookings.id] }),
  transactions: many(paymentTransactions),
  refunds: many(paymentRefunds),
}));

export const paymentTransactionsRelations = relations(paymentTransactions, ({ one }) => ({
  payment: one(payments, { fields: [paymentTransactions.paymentId], references: [payments.id] }),
}));

export const ledgerEntriesRelations = relations(ledgerEntries, ({ one }) => ({
  booking: one(bookings, { fields: [ledgerEntries.bookingId], references: [bookings.id] }),
  payment: one(payments, { fields: [ledgerEntries.paymentId], references: [payments.id] }),
}));
