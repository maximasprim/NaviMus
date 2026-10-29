import { index, numeric, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { idColumn, tenantIdColumn, timestampColumns } from "./_helpers.js";
import { bookings } from "./bookings.js";
import { payments } from "./payments.js";
import { tenants } from "./tenants.js";

export const invoices = pgTable(
  "invoices",
  {
    id: idColumn(),
    tenantId: tenantIdColumn().references(() => tenants.id, { onDelete: "restrict" }),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "restrict" }),
    invoiceNumber: varchar("invoice_number", { length: 50 }).notNull(), // e.g. INV-2026-000123, generated sequentially
    totalAmount: numeric("total_amount", { precision: 12, scale: 2 }).notNull(),
    amountPaid: numeric("amount_paid", { precision: 12, scale: 2 }).notNull().default("0.00"),
    balanceDue: numeric("balance_due", { precision: 12, scale: 2 }).notNull().default("0.00"),
    currency: varchar("currency", { length: 3 }).notNull(),
    pdfStorageKey: text("pdf_storage_key"),
    ...timestampColumns,
  },
  (table) => ({
    // Invoice numbers are generated sequentially per business - scoping
    // per tenant lets each tenant's sequence start at its own INV-...-000001
    // instead of sharing one platform-wide counter.
    tenantInvoiceNumberUnique: uniqueIndex("invoices_tenant_number_unique").on(table.tenantId, table.invoiceNumber),
    tenantIdx: index("invoices_tenant_idx").on(table.tenantId),
    bookingIdx: index("invoices_booking_idx").on(table.bookingId),
  })
);

export const receipts = pgTable(
  "receipts",
  {
    id: idColumn(),
    tenantId: tenantIdColumn().references(() => tenants.id, { onDelete: "restrict" }),
    paymentId: uuid("payment_id")
      .notNull()
      .references(() => payments.id, { onDelete: "restrict" }),
    receiptNumber: varchar("receipt_number", { length: 50 }).notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),
    pdfStorageKey: text("pdf_storage_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantReceiptNumberUnique: uniqueIndex("receipts_tenant_number_unique").on(table.tenantId, table.receiptNumber),
    tenantIdx: index("receipts_tenant_idx").on(table.tenantId),
    paymentIdx: index("receipts_payment_idx").on(table.paymentId),
  })
);

export const invoicesRelations = relations(invoices, ({ one }) => ({
  tenant: one(tenants, { fields: [invoices.tenantId], references: [tenants.id] }),
  booking: one(bookings, { fields: [invoices.bookingId], references: [bookings.id] }),
}));

export const receiptsRelations = relations(receipts, ({ one }) => ({
  tenant: one(tenants, { fields: [receipts.tenantId], references: [tenants.id] }),
  payment: one(payments, { fields: [receipts.paymentId], references: [payments.id] }),
}));
