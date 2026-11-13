import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { ok, paginated } from "@travel/http";
import { requireAuth, requireRoles } from "@travel/auth";
import { AuthorizationError, NotFoundError, ValidationError } from "@travel/types";
import { LISTING_KINDS, type ListingKind } from "@travel/validation";
import { CHILD_NAMES, childCanCreate, type ChildName, type RecordsRepository } from "./records-repository.js";

// ---------- small shared pieces ----------
const pageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-12-31");
const dateTime = z.string().datetime({ offset: true });
/** Money arrives as a number or numeric string; the database wants a 2-decimal string. */
const money = z.coerce.number().min(0).max(1_000_000_000).transform((n) => n.toFixed(2));
const currency = z.string().trim().length(3).toUpperCase();
const text = (max: number) => z.string().max(max).nullable().optional();

const LISTING_ROLES: Record<ListingKind, string[]> = {
  destination: ["admin", "super_admin", "destination_manager"],
  package: ["admin", "super_admin", "travel_manager"],
  accommodation: ["admin", "super_admin", "travel_manager"],
  transport: ["admin", "super_admin", "travel_manager"],
};

/** A featured image: null clears it; a string must be a key the media service issued for this kind of listing. */
const imageKey = (category: "destination_image" | "package_image") =>
  z
    .string()
    .regex(new RegExp(`^[0-9a-f-]{36}/${category}/[0-9a-f-]{36}/[0-9a-f-]{36}\\.[a-z0-9]{2,5}$`), "That isn't a valid uploaded image")
    .nullable()
    .optional();

// What each kind of listing lets an admin edit on its own page (everything optional; only what's sent changes).
const status = z.enum(["draft", "pending_review", "published", "rejected", "archived"]);
const DETAIL_SCHEMAS: Record<ListingKind, z.ZodTypeAny> = {
  destination: z.object({
    name: z.string().trim().min(2).max(200).optional(),
    shortDescription: text(500),
    description: text(20000),
    status: status.optional(),
    featured: z.boolean().optional(),
    bestTimeToVisit: text(500),
    timezone: text(64),
    averageDurationHours: z.number().int().min(0).max(1000).nullable().optional(),
    minimumAge: z.number().int().min(0).max(120).nullable().optional(),
    maximumCapacity: z.number().int().min(0).max(10_000_000).nullable().optional(),
    entryRequirements: text(5000),
    safetyInformation: text(5000),
    travelInformation: text(5000),
    weatherInformation: text(5000),
    accessibilityInformation: text(5000),
    featuredImageKey: imageKey("destination_image"), // set from a file uploaded through the media service, or cleared
  }),
  package: z.object({
    name: z.string().trim().min(2).max(200).optional(),
    shortDescription: text(500),
    description: text(20000),
    status: status.optional(),
    featured: z.boolean().optional(),
    durationDays: z.number().int().min(1).max(365).optional(),
    minGroupSize: z.number().int().min(1).max(1000).optional(),
    maxGroupSize: z.number().int().min(1).max(1000).nullable().optional(),
    inclusions: text(10000),
    exclusions: text(10000),
    termsAndConditions: text(20000),
    visaInformation: text(5000),
    insuranceInformation: text(5000),
    seoTitle: text(200),
    seoDescription: text(300),
    featuredImageKey: imageKey("package_image"),
  }),
  accommodation: z.object({
    name: z.string().trim().min(2).max(200).optional(),
    description: text(20000),
    status: status.optional(),
    type: z.string().trim().min(2).max(30).optional(),
    starRating: z.number().int().min(1).max(5).nullable().optional(),
    checkInTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
    checkOutTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  }),
  transport: z.object({
    name: z.string().trim().min(2).max(200).optional(),
    contactPhone: text(32),
  }),
};

// Child records: what can be created and edited (create = required fields; update = any of them).
const CHILD_CREATE: Record<ChildName, z.ZodObject<any>> = {
  "package-prices": z.object({
    travelerType: z.enum(["adult", "child", "infant"]),
    pricingType: z.string().trim().min(1).max(20).default("individual"),
    seasonLabel: z.string().max(50).nullable().optional(),
    seasonStartDate: date.nullable().optional(),
    seasonEndDate: date.nullable().optional(),
    amount: money,
    currency,
  }),
  "package-availability": z.object({
    travelDate: date,
    totalCapacity: z.number().int().min(0).max(100000),
    status: z.enum(["open", "closed", "sold_out"]).default("open"),
  }),
  "package-itinerary": z.object({
    dayNumber: z.number().int().min(1).max(365),
    title: z.string().max(200).nullable().optional(),
    description: z.string().max(10000).nullable().optional(),
  }),
  "package-inclusions": z.object({ label: z.string().trim().min(1).max(300) }),
  "package-exclusions": z.object({ label: z.string().trim().min(1).max(300) }),
  "package-activities": z.object({
    name: z.string().trim().min(1).max(200),
    description: z.string().max(5000).nullable().optional(),
    isOptional: z.boolean().default(false),
    additionalPrice: money.nullable().optional(),
    currency: currency.nullable().optional(),
  }),
  "room-types": z.object({
    name: z.string().trim().min(1).max(150),
    maxOccupancy: z.number().int().min(1).max(50).default(2),
    basePricePerNight: money,
    currency,
    mealPlan: z.enum(["room_only", "breakfast", "half_board", "full_board", "all_inclusive"]).nullable().optional(),
  }),
  rooms: z.object({
    roomNumber: z.string().trim().max(20).nullable().optional(),
    isActive: z.boolean().default(true),
  }),
  vehicles: z.object({
    vehicleTypeId: z.string().uuid(),
    name: z.string().trim().max(150).nullable().optional(),
    registrationNumber: z.string().trim().max(30).nullable().optional(),
    capacity: z.number().int().min(1).max(500),
  }),
  routes: z.object({
    basePrice: money,
    currency,
    estimatedDurationMinutes: z.number().int().min(0).max(100000).nullable().optional(),
  }),
};

const couponBase = z.object({
  code: z.string().trim().min(3).max(50).toUpperCase().regex(/^[A-Z0-9_-]+$/, "Letters, numbers, - and _ only"),
  discountType: z.enum(["percentage", "fixed_amount"]),
  discountValue: money,
  currency: currency.nullable().optional(),
  maxUses: z.number().int().min(1).nullable().optional(),
  minBookingAmount: money.nullable().optional(),
  validFrom: date.nullable().optional(),
  validUntil: date.nullable().optional(),
  isActive: z.boolean().default(true),
});
const couponCreate = couponBase.superRefine((v, ctx) => {
  if (v.discountType === "percentage" && Number(v.discountValue) > 100) ctx.addIssue({ code: "custom", message: "A percentage can't be more than 100", path: ["discountValue"] });
  if (v.discountType === "fixed_amount" && !v.currency) ctx.addIssue({ code: "custom", message: "A fixed amount needs a currency", path: ["currency"] });
  if (v.validFrom && v.validUntil && v.validUntil < v.validFrom) ctx.addIssue({ code: "custom", message: "The end date is before the start date", path: ["validUntil"] });
});
const couponUpdate = couponBase.partial().refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" });

const ruleSchema = z.object({
  conditionKey: z.string().trim().min(1).max(50),
  conditionValue: z.string().trim().min(1).max(100),
  discountType: z.enum(["percentage", "fixed_amount"]),
  discountValue: money,
});
const promoBase = z.object({
  name: z.string().trim().min(2).max(200),
  type: z.enum(["seasonal", "early_booking", "group", "last_minute", "flash_sale", "loyalty", "partner"]),
  description: z.string().max(500).nullable().optional(),
  startsAt: dateTime.transform((v) => new Date(v)).nullable().optional(),
  endsAt: dateTime.transform((v) => new Date(v)).nullable().optional(),
  isActive: z.boolean().default(true),
});
const promoCreate = promoBase.extend({ rules: z.array(ruleSchema).max(20).default([]) });
const promoUpdate = promoBase.partial().refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" });

const HISTORY_TYPES = ["user", "operator", "booking", "destination", "package", "accommodation", "transport", "coupon", "promotion", "review"] as const;

/**
 * Admin "records": the detail, history and edit endpoints behind the admin console's detail pages. Mounted at
 * /records on the admin service. Reads are scoped to the caller's tenant (a platform admin sees every tenant);
 * every change is written to the audit log.
 */
export function buildRecordsRoutes(repo: RecordsRepository) {
  const app = new Hono();
  app.use("*", requireAuth);

  const scopeOrNull = (c: any): string | null => (c.get("authUser").roles.includes("super_admin") ? null : c.get("tenantId"));
  const actor = (c: any): string => c.get("authUser").sub;
  const param = (c: any, name: string): string => {
    const v = c.req.param(name) as string | undefined;
    if (!v) throw new ValidationError(`Missing ${name}`);
    return v;
  };
  const listingKind = (c: any): ListingKind => {
    const k = param(c, "kind");
    if (!(LISTING_KINDS as readonly string[]).includes(k)) throw new NotFoundError("Listing type");
    return k as ListingKind;
  };
  /** The listing kinds have different owners (destinations vs packages...), so their role check happens here. */
  const listingKindForCaller = (c: any): ListingKind => {
    const kind = listingKind(c);
    const mine: string[] = c.get("authUser").roles;
    if (!mine.some((r) => LISTING_ROLES[kind].includes(r))) throw new AuthorizationError("You don't have access to this");
    return kind;
  };
  const childName = (c: any): ChildName => {
    const n = param(c, "name");
    if (!(CHILD_NAMES as readonly string[]).includes(n)) throw new NotFoundError("Record type");
    return n as ChildName;
  };

  const ADMIN = requireRoles("admin", "super_admin");
  const FINANCE = requireRoles("admin", "super_admin", "finance_manager");

  // ---------- history of any record ----------
  app.get(
    "/history",
    ADMIN,
    zValidator("query", pageQuery.extend({ resourceType: z.enum(HISTORY_TYPES), resourceId: z.string().uuid() })),
    async (c) => {
      const q = c.req.valid("query");
      const { items, total } = await repo.history(scopeOrNull(c), q.resourceType, q.resourceId, q);
      return paginated(c, items, q.page, q.pageSize, total);
    }
  );

  // ---------- payments & invoices ----------
  app.get("/payments", FINANCE, zValidator("query", pageQuery.extend({ status: z.string().optional(), provider: z.string().optional(), search: z.string().trim().max(100).optional() })), async (c) => {
    const q = c.req.valid("query");
    const { items, total } = await repo.listPayments(scopeOrNull(c), q);
    return paginated(c, items, q.page, q.pageSize, total);
  });
  app.get("/payments/:id", FINANCE, async (c) => ok(c, await repo.getPayment(scopeOrNull(c), param(c, "id"))));

  app.get("/invoices", FINANCE, zValidator("query", pageQuery.extend({ search: z.string().trim().max(100).optional(), unpaidOnly: z.enum(["true", "false"]).default("false") })), async (c) => {
    const q = c.req.valid("query");
    const { items, total } = await repo.listInvoices(scopeOrNull(c), { ...q, unpaidOnly: q.unpaidOnly === "true" });
    return paginated(c, items, q.page, q.pageSize, total);
  });

  // Subscription / billing activity of one tenant: platform admin only.
  app.get("/tenants/:id/billing-events", requireRoles("super_admin"), async (c) => ok(c, await repo.tenantBillingEvents(param(c, "id"))));

  // ---------- reviews (list every status; the existing moderate endpoint changes status) ----------
  app.get(
    "/reviews",
    requireRoles("admin", "super_admin", "customer_support"),
    zValidator("query", pageQuery.extend({ status: z.enum(["published", "pending_moderation", "removed"]).optional(), rating: z.coerce.number().int().min(1).max(5).optional(), reportedOnly: z.enum(["true", "false"]).default("false"), search: z.string().trim().max(100).optional() })),
    async (c) => {
      const q = c.req.valid("query");
      const { items, total } = await repo.listReviews(scopeOrNull(c), { ...q, reportedOnly: q.reportedOnly === "true" });
      return paginated(c, items, q.page, q.pageSize, total);
    }
  );

  // ---------- coupons ----------
  const MARKETING = requireRoles("admin", "super_admin", "marketing_manager");
  app.get("/coupons", MARKETING, zValidator("query", pageQuery.extend({ search: z.string().trim().max(50).optional(), active: z.enum(["true", "false"]).optional() })), async (c) => {
    const q = c.req.valid("query");
    const { items, total } = await repo.listCoupons(scopeOrNull(c), { ...q, active: q.active === undefined ? undefined : q.active === "true" });
    return paginated(c, items, q.page, q.pageSize, total);
  });
  app.post("/coupons", MARKETING, zValidator("json", couponCreate), async (c) => {
    const tenantId = c.get("tenantId");
    const row = await repo.createCoupon(tenantId, c.req.valid("json"));
    await repo.writeAudit({ tenantId, actorUserId: actor(c), action: "coupon.created", resourceType: "coupon", resourceId: row.id, metadata: { code: row.code } });
    return ok(c, row, undefined, 201);
  });
  app.patch("/coupons/:id", MARKETING, zValidator("json", couponUpdate), async (c) => {
    const patch = c.req.valid("json");
    const row = await repo.updateCoupon(scopeOrNull(c), param(c, "id"), patch);
    if (!row) throw new NotFoundError("Coupon");
    await repo.writeAudit({ tenantId: row.tenantId, actorUserId: actor(c), action: "coupon.updated", resourceType: "coupon", resourceId: row.id, metadata: { fields: Object.keys(patch) } });
    return ok(c, row);
  });
  app.delete("/coupons/:id", MARKETING, async (c) => {
    const row = await repo.deleteCoupon(scopeOrNull(c), param(c, "id"));
    if (!row) throw new NotFoundError("Coupon");
    await repo.writeAudit({ tenantId: row.tenantId, actorUserId: actor(c), action: "coupon.deleted", resourceType: "coupon", resourceId: row.id, metadata: { code: row.code } });
    return ok(c, { deleted: true });
  });

  // ---------- promotions (campaigns with discount rules) ----------
  app.get("/promotions", MARKETING, async (c) => ok(c, await repo.listPromotions(scopeOrNull(c))));
  app.post("/promotions", MARKETING, zValidator("json", promoCreate), async (c) => {
    const { rules, ...values } = c.req.valid("json");
    const tenantId = c.get("tenantId");
    const row = await repo.createPromotion(tenantId, values, rules);
    await repo.writeAudit({ tenantId, actorUserId: actor(c), action: "promotion.created", resourceType: "promotion", resourceId: row.id, metadata: { name: row.name } });
    return ok(c, row, undefined, 201);
  });
  app.patch("/promotions/:id", MARKETING, zValidator("json", promoUpdate), async (c) => {
    const patch = c.req.valid("json");
    const row = await repo.updatePromotion(scopeOrNull(c), param(c, "id"), patch);
    if (!row) throw new NotFoundError("Promotion");
    await repo.writeAudit({ tenantId: row.tenantId, actorUserId: actor(c), action: "promotion.updated", resourceType: "promotion", resourceId: row.id, metadata: { fields: Object.keys(patch) } });
    return ok(c, row);
  });
  app.delete("/promotions/:id", MARKETING, async (c) => {
    const row = await repo.deletePromotion(scopeOrNull(c), param(c, "id"));
    if (!row) throw new NotFoundError("Promotion");
    await repo.writeAudit({ tenantId: row.tenantId, actorUserId: actor(c), action: "promotion.deleted", resourceType: "promotion", resourceId: row.id, metadata: { name: row.name } });
    return ok(c, { deleted: true });
  });
  app.post("/promotions/:id/rules", MARKETING, zValidator("json", ruleSchema), async (c) => {
    const row = await repo.addPromotionRule(scopeOrNull(c), param(c, "id"), c.req.valid("json"));
    if (!row) throw new NotFoundError("Promotion");
    return ok(c, row, undefined, 201);
  });
  app.delete("/promotion-rules/:ruleId", MARKETING, async (c) => {
    if (!(await repo.deletePromotionRule(scopeOrNull(c), param(c, "ruleId")))) throw new NotFoundError("Rule");
    return ok(c, { deleted: true });
  });

  // ---------- everything linked to one user / operator ----------
  app.get("/users/:id/overview", ADMIN, async (c) => ok(c, await repo.userOverview(scopeOrNull(c), param(c, "id"))));
  app.get("/operators/:id/overview", requireRoles("admin", "super_admin", "travel_manager"), async (c) => ok(c, await repo.operatorOverview(scopeOrNull(c), param(c, "id"))));

  // ---------- one listing in full, and its own fields ----------
  app.get("/listing/:kind/:id", async (c) => {
    const kind = listingKindForCaller(c);
    return ok(c, await repo.getListingFull(kind, scopeOrNull(c), param(c, "id")));
  });
  app.patch("/listing/:kind/:id", async (c) => {
    const kind = listingKindForCaller(c);
    const parsed = DETAIL_SCHEMAS[kind]!.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) throw new ValidationError(parsed.error.issues.map((i) => `${i.path.join(".") || "request"}: ${i.message}`).join("; "));
    const values = parsed.data as Record<string, unknown>;
    if (Object.keys(values).length === 0) throw new ValidationError("Nothing to update");
    // Outside the platform admin, an image must sit under the caller's own tenant.
    if (typeof values.featuredImageKey === "string" && scopeOrNull(c) && !values.featuredImageKey.startsWith(`${scopeOrNull(c)}/`)) {
      throw new ValidationError("That image doesn't belong to your organisation");
    }
    const row = await repo.updateListingFields(kind, scopeOrNull(c), param(c, "id"), values);
    if (!row) throw new NotFoundError(kind);
    await repo.writeAudit({ tenantId: row.tenantId, actorUserId: actor(c), action: `${kind}.updated`, resourceType: kind, resourceId: row.id, metadata: { fields: Object.keys(values) } });
    return ok(c, row);
  });

  // ---------- child records: prices, availability, itinerary, inclusions, rooms, vehicles, routes ----------
  const CHILD_ROLES = requireRoles("admin", "super_admin", "travel_manager");
  app.get("/children/:name", CHILD_ROLES, zValidator("query", z.object({ parentId: z.string().uuid() })), async (c) => {
    return ok(c, await repo.listChildren(childName(c), scopeOrNull(c), c.req.valid("query").parentId));
  });
  app.post("/children/:name", CHILD_ROLES, async (c) => {
    const name = childName(c);
    if (!childCanCreate(name)) throw new ValidationError("These can't be created from the admin console");
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const { parentId, ...rest } = body;
    if (typeof parentId !== "string") throw new ValidationError("parentId is required");
    const parsed = CHILD_CREATE[name].safeParse(rest);
    if (!parsed.success) throw new ValidationError(parsed.error.issues.map((i) => `${i.path.join(".") || "request"}: ${i.message}`).join("; "));
    const res = await repo.createChild(name, scopeOrNull(c), parentId, parsed.data);
    await repo.writeAudit({ tenantId: res.tenantId, actorUserId: actor(c), action: `${res.kind}.updated`, resourceType: res.kind, resourceId: res.rootId, metadata: { child: name, op: "added" } });
    return ok(c, res.row, undefined, 201);
  });
  app.patch("/children/:name/:id", CHILD_ROLES, async (c) => {
    const name = childName(c);
    const parsed = CHILD_CREATE[name].partial().safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) throw new ValidationError(parsed.error.issues.map((i) => `${i.path.join(".") || "request"}: ${i.message}`).join("; "));
    // .partial() drops the defaults' "required" nature but zod still applies defaults; keep only what the caller sent.
    const sent = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const values = Object.fromEntries(Object.entries(parsed.data).filter(([k]) => k in sent));
    if (Object.keys(values).length === 0) throw new ValidationError("Nothing to update");
    const res = await repo.updateChild(name, scopeOrNull(c), param(c, "id"), values);
    await repo.writeAudit({ tenantId: res.tenantId, actorUserId: actor(c), action: `${res.kind}.updated`, resourceType: res.kind, resourceId: res.rootId, metadata: { child: name, op: "changed", fields: Object.keys(values) } });
    return ok(c, res.row);
  });
  app.delete("/children/:name/:id", CHILD_ROLES, async (c) => {
    const name = childName(c);
    const res = await repo.deleteChild(name, scopeOrNull(c), param(c, "id"));
    await repo.writeAudit({ tenantId: res.tenantId, actorUserId: actor(c), action: `${res.kind}.updated`, resourceType: res.kind, resourceId: res.rootId, metadata: { child: name, op: "removed" } });
    return ok(c, { deleted: true });
  });

  return app;
}
