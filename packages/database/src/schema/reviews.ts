import { boolean, index, integer, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { idColumn, tenantIdColumn, timestampColumns } from "./_helpers.js";
import { users } from "./identity.js";
import { bookings } from "./bookings.js";
import { tenants } from "./tenants.js";

export const reviews = pgTable(
  "reviews",
  {
    id: idColumn(),
    tenantId: tenantIdColumn().references(() => tenants.id, { onDelete: "restrict" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "restrict" }),
    // destination|package|accommodation|transport|tour_guide|airport_transfer
    subjectType: varchar("subject_type", { length: 30 }).notNull(),
    subjectId: uuid("subject_id").notNull(),
    rating: integer("rating").notNull(), // 1-5, enforced in app layer / check constraint via migration
    title: varchar("title", { length: 200 }),
    body: text("body"),
    verifiedBooking: boolean("verified_booking").notNull().default(true),
    operatorResponse: text("operator_response"),
    operatorRespondedAt: timestamp("operator_responded_at", { withTimezone: true }),
    status: varchar("status", { length: 20 }).notNull().default("published"), // published|pending_moderation|removed
    reportCount: integer("report_count").notNull().default(0),
    ...timestampColumns,
  },
  (table) => ({
    subjectIdx: index("reviews_subject_idx").on(table.subjectType, table.subjectId),
    tenantIdx: index("reviews_tenant_idx").on(table.tenantId),
    userIdx: index("reviews_user_idx").on(table.userId),
    bookingIdx: index("reviews_booking_idx").on(table.bookingId),
  })
);

export const reviewImages = pgTable(
  "review_images",
  {
    id: idColumn(),
    reviewId: uuid("review_id")
      .notNull()
      .references(() => reviews.id, { onDelete: "cascade" }),
    storageKey: text("storage_key").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    reviewIdx: index("review_images_review_idx").on(table.reviewId),
  })
);

export const reviewsRelations = relations(reviews, ({ one, many }) => ({
  tenant: one(tenants, { fields: [reviews.tenantId], references: [tenants.id] }),
  user: one(users, { fields: [reviews.userId], references: [users.id] }),
  booking: one(bookings, { fields: [reviews.bookingId], references: [bookings.id] }),
  images: many(reviewImages),
}));
