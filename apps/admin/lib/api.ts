import { clearSessionMarker, COOKIE_SESSION } from "./session-core";
import { apiFetch } from "./api-client";
import { apiBase } from "./api-transport";

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: "active" | "suspended" | "trial" | "cancelled";
  settings?: Record<string, unknown> | null;
  ownerUserId?: string | null;
  planId?: string | null;
  suspendedAt?: string | null;
  suspendedReason?: string | null;
  createdAt: string;
}

export interface TenantWithStats extends Tenant {
  activeDestinations: number;
  activePackages: number;
  activeOperators: number;
  totalBookings: number;
}

// --- Platform: tenant management (super_admin only, /api/v1/platform) ---
// includeTenant: false everywhere here - these calls operate above any
// single tenant (creating one, listing every one), so there's nothing
// to scope them to, and the gateway bypasses tenant resolution for this
// prefix regardless (see apps/api-gateway/src/index.ts).

export async function listTenants(token: string, params: { page?: number; pageSize?: number; status?: string } = {}) {
  const qs = new URLSearchParams();
  if (params.page) qs.set("page", String(params.page));
  if (params.pageSize) qs.set("pageSize", String(params.pageSize));
  if (params.status) qs.set("status", params.status);
  const { data, meta } = await apiFetch<Tenant[]>(`/api/v1/platform/tenants?${qs.toString()}`, {
    token,
    includeTenant: false,
  });
  return { items: data, meta };
}

export async function getTenant(token: string, id: string) {
  const { data } = await apiFetch<TenantWithStats>(`/api/v1/platform/tenants/${id}`, { token, includeTenant: false });
  return data;
}

export async function createTenant(
  token: string,
  input: {
    name: string;
    slug?: string;
    ownerEmail: string;
    ownerPassword: string;
    ownerFirstName: string;
    ownerLastName: string;
    ownerPhone?: string;
  }
) {
  const { data } = await apiFetch<Tenant & { ownerUserId: string }>("/api/v1/platform/tenants", {
    method: "POST",
    token,
    body: input,
    includeTenant: false,
  });
  return data;
}

export async function updateTenant(token: string, id: string, input: { name?: string; settings?: Record<string, unknown> }) {
  const { data } = await apiFetch<Tenant>(`/api/v1/platform/tenants/${id}`, {
    method: "PATCH",
    token,
    body: input,
    includeTenant: false,
  });
  return data;
}

export async function suspendTenant(token: string, id: string, reason?: string) {
  const { data } = await apiFetch<Tenant>(`/api/v1/platform/tenants/${id}/suspend`, {
    method: "POST",
    token,
    body: { reason },
    includeTenant: false,
  });
  return data;
}

export async function archiveTenant(token: string, id: string, reason?: string) {
  const { data } = await apiFetch<Tenant>(`/api/v1/platform/tenants/${id}/archive`, {
    method: "POST",
    token,
    body: { reason },
    includeTenant: false,
  });
  return data;
}

export async function reactivateTenant(token: string, id: string) {
  const { data } = await apiFetch<Tenant>(`/api/v1/platform/tenants/${id}/reactivate`, {
    method: "POST",
    token,
    includeTenant: false,
  });
  return data;
}

export interface DomainStatus {
  domain: string;
  verified: boolean;
  dnsRecord?: { type: string; name: string; value: string };
}

export async function requestCustomDomain(token: string, domain: string) {
  const { data } = await apiFetch<DomainStatus>("/api/v1/admin/tenant/domain", {
    method: "PUT",
    token,
    body: { domain },
  });
  return data;
}

export async function verifyCustomDomain(token: string) {
  const { data } = await apiFetch<{ domain: string; verified: boolean }>("/api/v1/admin/tenant/domain/verify", {
    method: "POST",
    token,
  });
  return data;
}

export async function removeCustomDomain(token: string) {
  await apiFetch<{ removed: boolean }>("/api/v1/admin/tenant/domain", { method: "DELETE", token });
}

export interface PlanInfo {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  monthlyPriceUsd: string;
  maxOperators: number | null;
  maxStaffUsers: number | null;
  maxBookingsPerMonth: number | null;
}

export interface TenantUsage {
  plan: {
    planId: string | null;
    planCode: string | null;
    planName: string | null;
    maxOperators: number | null;
    maxStaffUsers: number | null;
    maxBookingsPerMonth: number | null;
  };
  usage: { bookingsThisMonth: number; activeOperators: number; staffUsers: number };
  atLimit: { bookingsThisMonth: boolean; activeOperators: boolean; staffUsers: boolean };
}

export async function getTenantUsage(token: string) {
  const { data } = await apiFetch<TenantUsage>("/api/v1/admin/tenant/usage", { token });
  return data;
}

export interface BillingOverview extends TenantUsage {
  billingEnabled: boolean;
  subscription: {
    status: string | null;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    paymentProblem: boolean;
    canManage: boolean;
  };
  availablePlans: Array<{
    code: string;
    name: string;
    description?: string | null;
    monthlyPriceUsd: string;
    maxOperators: number | null;
    maxStaffUsers: number | null;
    maxBookingsPerMonth: number | null;
    isCurrent: boolean;
    purchasable: boolean;
  }>;
}

export async function getBilling(token: string) {
  const { data } = await apiFetch<BillingOverview>("/api/v1/admin/billing", { token });
  return data;
}

/** Returns Stripe's hosted Checkout URL; the caller redirects the browser to it. */
export async function startCheckout(token: string, planCode: string) {
  const { data } = await apiFetch<{ url: string }>("/api/v1/admin/billing/checkout", { token, method: "POST", body: { planCode } });
  return data.url;
}

/** Returns Stripe's hosted Billing Portal URL (change plan, cancel, update card, invoices). */
export async function openBillingPortal(token: string) {
  const { data } = await apiFetch<{ url: string }>("/api/v1/admin/billing/portal", { token, method: "POST" });
  return data.url;
}

export async function listPlans(token: string) {
  const { data } = await apiFetch<PlanInfo[]>("/api/v1/platform/plans", { token, includeTenant: false });
  return data;
}

export async function assignTenantPlan(token: string, tenantId: string, planId: string | null) {
  const { data } = await apiFetch<Tenant>(`/api/v1/platform/tenants/${tenantId}/plan`, {
    method: "PATCH",
    token,
    body: { planId },
    includeTenant: false,
  });
  return data;
}

/**
 * A plain <a href> can't carry the Authorization header this endpoint
 * requires, so this fetches the export with the token attached and
 * triggers the browser's save-file flow via a Blob URL instead -
 * the standard pattern for authenticated file downloads in a SPA.
 */
export async function downloadTenantExport(token: string, tenantId: string, tenantSlug: string) {
  // Same-origin proxy + session cookie (see api-transport.ts); CSRF header because the cookie authenticates.
  const res = await fetch(`${apiBase()}/api/v1/platform/tenants/${tenantId}/export`, {
    headers: {
      "X-Requested-With": "travel-web",
      ...(token === COOKIE_SESSION ? {} : { Authorization: `Bearer ${token}` }),
    },
    credentials: "same-origin",
  });
  if (!res.ok) throw new Error("Could not generate export");
  const json = await res.json();
  // Unwrap the {success, data} envelope - the downloaded file should be
  // just the export bundle itself, not the API response wrapper.
  const blob = new Blob([JSON.stringify(json.data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `tenant-${tenantSlug}-export.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Irreversible - see TenantService.hardDelete's doc comment. Requires suspending the tenant first and echoing its slug back. */
export async function hardDeleteTenant(token: string, tenantId: string, confirmSlug: string) {
  await apiFetch<{ deleted: boolean }>(`/api/v1/platform/tenants/${tenantId}`, {
    method: "DELETE",
    token,
    body: { confirmSlug },
    includeTenant: false,
  });
}

export interface DashboardMetrics {
  bookings: { total: number; byStatus: Record<string, number> };
  revenue: { grossRevenue: number; totalRefunds: number; platformFees: number };
  customers: { newInRange: number };
  activeDestinations: number;
  activePackages: number;
  activeOperators: number;
  popularDestinations: { destinationId: string; destinationName: string; bookingCount: number }[];
  upcomingTrips: number;
  pendingOperators: number;
  cancellationRatePercent: number;
}

export interface Operator {
  id: string;
  businessName: string;
  status: "pending" | "approved" | "rejected" | "suspended";
  contactEmail: string;
  contactPhone?: string | null;
  createdAt: string;
}

export interface AdminLoginResult {
  authenticated: boolean;
  /** The tenant this account belongs to (the platform's own "default" tenant for a platform admin). */
  tenant: { id: string; slug: string; name: string };
  roles: string[];
  isPlatformAdmin: boolean;
}

/**
 * Admin sign-in. The person gives only email + password: the API finds the account and
 * says which tenant and role it is. `workspace` is sent only in the rare case the API
 * asked for it (one email managing several workspaces).
 */
export async function login(input: { email: string; password: string; workspace?: string }) {
  const workspace = input.workspace?.trim().toLowerCase();
  const { data } = await apiFetch<AdminLoginResult>("/api/v1/auth/admin-login", {
    method: "POST",
    body: { email: input.email, password: input.password, ...(workspace ? { workspace } : {}) },
    includeTenant: false, // no tenant is named at sign-in; the server works it out
  });
  return data;
}

export async function getDashboardMetrics(token: string, range: { from?: string; to?: string } = {}) {
  const qs = new URLSearchParams();
  if (range.from) qs.set("from", range.from);
  if (range.to) qs.set("to", range.to);
  const { data } = await apiFetch<DashboardMetrics>(`/api/v1/admin/dashboard?${qs.toString()}`, { token });
  return data;
}

export interface DashboardTimeSeries {
  revenue: { date: string; amount: number }[];
  bookings: { date: string; count: number }[];
}

export async function getDashboardTimeSeries(token: string, range: { from?: string; to?: string } = {}) {
  const qs = new URLSearchParams();
  if (range.from) qs.set("from", range.from);
  if (range.to) qs.set("to", range.to);
  const { data } = await apiFetch<DashboardTimeSeries>(`/api/v1/admin/dashboard/timeseries?${qs.toString()}`, { token });
  return data;
}

export type OperatorStatus = Operator["status"];

/** Operators in one status (the operators page's tabs). pageSize 100 is the API's maximum. */
export async function listOperatorsByStatus(token: string, status: OperatorStatus) {
  const { data } = await apiFetch<Operator[]>(`/api/v1/operators?status=${status}&pageSize=100`, { token });
  return data;
}

export async function listPendingOperators(token: string) {
  return listOperatorsByStatus(token, "pending");
}

/** Suspends an approved operator. (The API has no "reinstate" action yet.) */
export async function suspendOperator(token: string, id: string) {
  const { data } = await apiFetch<Operator>(`/api/v1/operators/${id}/suspend`, { method: "POST", token });
  return data;
}

export async function reviewOperator(token: string, id: string, decision: "approved" | "rejected", reason?: string) {
  const { data } = await apiFetch<Operator>(`/api/v1/operators/${id}/review`, {
    method: "POST",
    token,
    body: { decision, reason },
  });
  return data;
}

export interface Review {
  id: string;
  subjectType: string;
  subjectId: string;
  rating: number;
  title?: string;
  body?: string;
  status: string;
  reportCount: number;
  createdAt: string;
}

export async function listFlaggedReviews(token: string) {
  // Reviews with at least one report are the moderation queue - the public
  // reviews search endpoint supports listing, filtered here by report count
  // client-side since the service doesn't expose a report-count filter yet.
  const { data } = await apiFetch<Review[]>(`/api/v1/reviews?pageSize=100`, { token });
  return data.filter((r) => r.reportCount > 0 || r.status === "pending_moderation");
}

export async function moderateReview(token: string, id: string, status: "published" | "removed") {
  const { data } = await apiFetch<Review>(`/api/v1/admin/reviews/${id}/moderate`, {
    method: "PATCH",
    token,
    body: { status },
  });
  return data;
}

// --- Bookings management ---
export interface AdminBooking {
  id: string;
  userId: string;
  status: string;
  travelDate: string;
  travelerCount: number;
  totalAmount: string;
  currency: string;
  contactEmail: string;
  contactPhone?: string;
  specialRequests?: string | null;
  createdAt: string;
}

export async function listAllBookings(token: string, page = 1, pageSize = 20, status?: string) {
  const qs = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (status) qs.set("status", status);
  const { data, meta } = await apiFetch<AdminBooking[]>(`/api/v1/bookings/admin?${qs.toString()}`, { token });
  return { items: data, meta };
}

export async function getAdminBooking(token: string, id: string) {
  const { data } = await apiFetch<AdminBooking & { items: any[]; travelers: any[]; statusHistory: any[] }>(
    `/api/v1/bookings/admin/${id}`,
    { token }
  );
  return data;
}

export async function adminCancelBooking(token: string, id: string, reason?: string) {
  const { data } = await apiFetch<{ refundAmount: number; penaltyAmount: number; daysBeforeTrip: number }>(
    `/api/v1/bookings/admin/${id}/cancel`,
    { method: "PATCH", token, body: { reason } }
  );
  return data;
}

export async function listPaymentsForBooking(token: string, bookingId: string) {
  const { data } = await apiFetch<{ id: string; status: string; amount: string; currency: string }[]>(
    `/api/v1/payments/bookings/${bookingId}/payments`,
    { token }
  );
  return data;
}

export async function issueRefund(token: string, input: { paymentId: string; amount?: number; reason?: string }) {
  const { data } = await apiFetch<{ id: string; status: string }>("/api/v1/payments/refunds", {
    method: "POST",
    token,
    body: input,
  });
  return data;
}

// --- User management ---
export interface AdminUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  status: "active" | "suspended" | "deactivated";
  emailVerifiedAt: string | null;
  createdAt: string;
  tenantId?: string;
  tenantName?: string | null;
}

export async function listUsers(
  token: string,
  page = 1,
  pageSize = 20,
  search?: string,
  filters: { status?: string; tenantId?: string; deleted?: boolean } = {}
) {
  const qs = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (search) qs.set("search", search);
  if (filters.status) qs.set("status", filters.status);
  if (filters.tenantId) qs.set("tenantId", filters.tenantId);
  if (filters.deleted) qs.set("deleted", "true");
  const { data, meta } = await apiFetch<AdminUser[]>(`/api/v1/auth/admin/users?${qs.toString()}`, { token });
  return { items: data, meta };
}

export async function getAdminUser(token: string, id: string) {
  const { data } = await apiFetch<AdminUser & { roles: string[] }>(`/api/v1/auth/admin/users/${id}`, { token });
  return data;
}

export async function setUserStatus(token: string, id: string, status: AdminUser["status"]) {
  const { data } = await apiFetch<{ message: string }>(`/api/v1/auth/admin/users/${id}/status`, {
    method: "PATCH",
    token,
    body: { status },
  });
  return data;
}

export async function setUserRole(token: string, id: string, role: string) {
  const { data } = await apiFetch<{ message: string }>(`/api/v1/auth/admin/users/${id}/role`, {
    method: "PATCH",
    token,
    body: { role },
  });
  return data;
}

// --- Approvals ---
export interface PendingApprovals {
  destinations: { id: string; name: string; slug: string; createdAt: string }[];
  packages: { id: string; name: string; slug: string; createdAt: string }[];
}

export async function listPendingApprovals(token: string) {
  const { data } = await apiFetch<PendingApprovals>("/api/v1/admin/approvals/pending", { token });
  return data;
}

export async function approveDestination(token: string, id: string, decision: "published" | "rejected", reason?: string) {
  const { data } = await apiFetch(`/api/v1/admin/destinations/${id}/approve`, {
    method: "PATCH",
    token,
    body: { decision, reason },
  });
  return data;
}

export async function approvePackage(token: string, id: string, decision: "published" | "rejected", reason?: string) {
  const { data } = await apiFetch(`/api/v1/admin/packages/${id}/approve`, {
    method: "PATCH",
    token,
    body: { decision, reason },
  });
  return data;
}

// --- Cancellation policies ---
export interface CancellationPolicy {
  id: string;
  name: string;
  operatorId: string | null;
  rules: { id: string; daysBeforeMin: number; daysBeforeMax: number | null; refundPercentage: string; penaltyPercentage: string }[];
}

export async function listCancellationPolicies(token: string) {
  const { data } = await apiFetch<CancellationPolicy[]>("/api/v1/admin/cancellation-policies", { token });
  return data;
}

export async function createCancellationPolicy(
  token: string,
  input: { name: string; operatorId?: string; rules: { daysBeforeMin: number; daysBeforeMax?: number; refundPercentage: number; penaltyPercentage: number }[] }
) {
  const { data } = await apiFetch<CancellationPolicy>("/api/v1/admin/cancellation-policies", {
    method: "POST",
    token,
    body: input,
  });
  return data;
}

// --- Settings (currency, fees, payment/notification config - generic key/value) ---
export interface SystemSetting {
  key: string;
  value: unknown;
  description?: string | null;
}

export async function listSettings(token: string) {
  const { data } = await apiFetch<SystemSetting[]>("/api/v1/admin/settings", { token });
  return data;
}

export async function updateSetting(token: string, key: string, value: unknown, description?: string) {
  const { data } = await apiFetch<SystemSetting>("/api/v1/admin/settings", {
    method: "PUT",
    token,
    body: { key, value, description },
  });
  return data;
}

// --- Audit log ---
export interface AuditLogEntry {
  id: string;
  actorUserId: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export async function listAuditLogs(token: string, page = 1, pageSize = 50) {
  const { data, meta } = await apiFetch<AuditLogEntry[]>(
    `/api/v1/admin/audit-logs?page=${page}&pageSize=${pageSize}`,
    { token }
  );
  return { items: data, meta };
}

// --- Notification templates ---
export interface NotificationTemplate {
  id: string;
  key: string;
  channel: string;
  locale: string;
  subject: string | null;
  bodyTemplate: string;
}

export async function listNotificationTemplates(token: string) {
  const { data } = await apiFetch<NotificationTemplate[]>("/api/v1/admin/notification-templates", { token });
  return data;
}

export async function upsertNotificationTemplate(
  token: string,
  input: { key: string; channel: string; locale?: string; subject?: string; bodyTemplate: string }
) {
  const { data } = await apiFetch<NotificationTemplate>("/api/v1/admin/notification-templates", {
    method: "PUT",
    token,
    body: input,
  });
  return data;
}

// --- Reference data (spec section 44) ---
export interface Country {
  id: string;
  isoCode: string;
  name: string;
}
export interface Region {
  id: string;
  countryId: string;
  name: string;
}
export interface City {
  id: string;
  regionId: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
}
export interface DestinationCategory {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
}
export interface TransferLocation {
  id: string;
  cityId: string;
  name: string;
  type: string;
  address: string | null;
}

export async function listCountries(token: string) {
  const { data } = await apiFetch<Country[]>("/api/v1/admin/countries", { token });
  return data;
}
export async function createCountry(token: string, input: { isoCode: string; name: string }) {
  const { data } = await apiFetch<Country>("/api/v1/admin/countries", { method: "POST", token, body: input });
  return data;
}

export async function listRegions(token: string, countryId?: string) {
  const qs = countryId ? `?countryId=${countryId}` : "";
  const { data } = await apiFetch<Region[]>(`/api/v1/admin/regions${qs}`, { token });
  return data;
}
export async function createRegion(token: string, input: { countryId: string; name: string }) {
  const { data } = await apiFetch<Region>("/api/v1/admin/regions", { method: "POST", token, body: input });
  return data;
}

export async function listCities(token: string, regionId?: string) {
  const qs = regionId ? `?regionId=${regionId}` : "";
  const { data } = await apiFetch<City[]>(`/api/v1/admin/cities${qs}`, { token });
  return data;
}
export async function createCity(token: string, input: { regionId: string; name: string; latitude?: number; longitude?: number }) {
  const { data } = await apiFetch<City>("/api/v1/admin/cities", { method: "POST", token, body: input });
  return data;
}

export async function listDestinationCategories(token: string) {
  const { data } = await apiFetch<DestinationCategory[]>("/api/v1/admin/categories", { token });
  return data;
}
export async function createDestinationCategory(token: string, input: { name: string; slug: string; parentId?: string; description?: string }) {
  const { data } = await apiFetch<DestinationCategory>("/api/v1/admin/categories", { method: "POST", token, body: input });
  return data;
}

export async function listTransferLocations(token: string, cityId?: string) {
  const qs = cityId ? `?cityId=${cityId}` : "";
  const { data } = await apiFetch<TransferLocation[]>(`/api/v1/admin/transfer-locations${qs}`, { token });
  return data;
}
export async function createTransferLocation(token: string, input: { cityId: string; name: string; type?: string; address?: string }) {
  const { data } = await apiFetch<TransferLocation>("/api/v1/admin/transfer-locations", { method: "POST", token, body: input });
  return data;
}

// --- Support tickets (admin side) ---
export interface AdminSupportTicket {
  id: string;
  userId: string;
  subject: string;
  status: "open" | "in_progress" | "resolved" | "closed";
  createdAt: string;
  updatedAt: string;
}

export async function listAllSupportTickets(token: string, status?: string, userId?: string) {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (userId) params.set("userId", userId);
  const qs = params.toString() ? `?${params.toString()}` : "";
  const { data } = await apiFetch<AdminSupportTicket[]>(`/api/v1/account/admin/support-tickets${qs}`, { token });
  return data;
}

export async function getAdminSupportTicket(token: string, id: string) {
  const { data } = await apiFetch<AdminSupportTicket & { messages: { id: string; senderUserId: string; body: string; createdAt: string }[] }>(
    `/api/v1/account/admin/support-tickets/${id}`,
    { token }
  );
  return data;
}

export async function replyToSupportTicket(token: string, id: string, message: string) {
  const { data } = await apiFetch(`/api/v1/account/admin/support-tickets/${id}/messages`, {
    method: "POST",
    token,
    body: { message },
  });
  return data;
}

export async function setSupportTicketStatus(token: string, id: string, status: AdminSupportTicket["status"]) {
  const { data } = await apiFetch<{ message: string }>(`/api/v1/account/admin/support-tickets/${id}/status`, {
    method: "PATCH",
    token,
    body: { status },
  });
  return data;
}

/**
 * Ends the session on the server (revokes the refresh-token family and clears
 * the httpOnly cookies) and then forgets the signed-in marker. The marker is
 * cleared even if the call fails, so the UI never gets stuck "signed in".
 */
export async function logout(): Promise<void> {
  try {
    await apiFetch("/api/v1/auth/logout", { method: "POST", token: COOKIE_SESSION });
  } catch {
    /* already signed out / API unreachable: still sign out locally */
  } finally {
    clearSessionMarker();
  }
}


// ===================== Admin: full detail views + create / edit / delete =====================

// --- Users ---
export interface AdminUserDetail extends AdminUser {
  phone: string | null;
  nationality: string | null;
  mfaEnabled: boolean;
  updatedAt: string;
  roles: string[];
  tenant: { id: string; name: string; slug: string } | null;
  bookingCount: number;
  lastBookingAt: string | null;
  operator: { id: string; businessName: string; status: string; title: string | null } | null;
}

export async function getUserDetail(token: string, id: string) {
  const { data } = await apiFetch<AdminUserDetail>(`/api/v1/auth/admin/users/${id}`, { token });
  return data;
}

export async function createUser(
  token: string,
  input: { email: string; password: string; firstName: string; lastName: string; phone?: string; role: string; tenantId?: string }
) {
  const { data } = await apiFetch<{ userId: string }>("/api/v1/auth/admin/users", { method: "POST", token, body: input });
  return data;
}

export async function updateUser(
  token: string,
  id: string,
  patch: { email?: string; firstName?: string; lastName?: string; phone?: string | null }
) {
  const { data } = await apiFetch<{ message: string }>(`/api/v1/auth/admin/users/${id}`, { method: "PATCH", token, body: patch });
  return data;
}

export async function deleteUser(token: string, id: string) {
  const { data } = await apiFetch<{ message: string }>(`/api/v1/auth/admin/users/${id}`, { method: "DELETE", token });
  return data;
}

// --- Operators ---
export interface OperatorDetail extends Operator {
  slug: string;
  description: string | null;
  commissionRatePercent: string | null;
  approvedAt: string | null;
  updatedAt: string;
  staff: { userId: string; title: string | null; email: string; firstName: string; lastName: string; status: string; addedAt: string }[];
  documents: { id: string; documentType: string; storageKey: string; status: string; createdAt: string }[];
  stats: { packages: number; publishedPackages: number; bookings: number; revenuePaid: string };
  history: { id: string; action: string; actorUserId: string | null; metadata: Record<string, unknown> | null; createdAt: string }[];
}

export async function getOperatorDetail(token: string, id: string) {
  const { data } = await apiFetch<OperatorDetail>(`/api/v1/operators/${id}/detail`, { token });
  return data;
}

export async function updateOperator(
  token: string,
  id: string,
  patch: { businessName?: string; contactEmail?: string; contactPhone?: string | null; description?: string | null }
) {
  const { data } = await apiFetch<Operator>(`/api/v1/operators/${id}`, { method: "PATCH", token, body: patch });
  return data;
}

/** Suspended -> approved again; rejected -> back to pending. */
export async function reinstateOperator(token: string, id: string) {
  const { data } = await apiFetch<Operator>(`/api/v1/operators/${id}/reinstate`, { method: "POST", token });
  return data;
}

export async function deleteOperator(token: string, id: string) {
  await apiFetch<{ deleted: boolean }>(`/api/v1/operators/${id}`, { method: "DELETE", token });
}

export async function removeOperatorStaff(token: string, operatorId: string, userId: string) {
  await apiFetch<{ removed: boolean }>(`/api/v1/operators/${operatorId}/staff/${userId}`, { method: "DELETE", token });
}

export async function reviewOperatorDocument(token: string, documentId: string, decision: "approved" | "rejected") {
  await apiFetch(`/api/v1/operators/documents/${documentId}/review`, { method: "POST", token, body: { decision } });
}

// --- Listings (destinations & packages) ---
export type ListingKind = "destination" | "package" | "accommodation" | "transport";
export type ListingStatus = "draft" | "pending_review" | "published" | "rejected" | "archived";
export interface ListingRow {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  status: ListingStatus;
  featured: boolean;
  createdAt: string;
  operatorName?: string | null;
  durationDays?: number;
}
export interface ListingDetail extends ListingRow {
  description: string | null;
  shortDescription: string | null;
  contactPhone?: string | null;
}

export async function listListings(
  token: string,
  kind: ListingKind,
  params: { page?: number; pageSize?: number; search?: string; status?: string; deleted?: boolean } = {}
) {
  const qs = new URLSearchParams({ page: String(params.page ?? 1), pageSize: String(params.pageSize ?? 20) });
  if (params.search) qs.set("search", params.search);
  if (params.status) qs.set("status", params.status);
  if (params.deleted) qs.set("deleted", "true");
  const { data, meta } = await apiFetch<ListingRow[]>(`/api/v1/admin/listings/${kind}s?${qs.toString()}`, { token });
  return { items: data, meta };
}

export async function getListing(token: string, kind: ListingKind, id: string) {
  const { data } = await apiFetch<ListingDetail>(`/api/v1/admin/listings/${kind}s/${id}`, { token });
  return data;
}

export async function updateListing(
  token: string,
  kind: ListingKind,
  id: string,
  patch: { name?: string; shortDescription?: string | null; description?: string | null; status?: ListingStatus; featured?: boolean; contactPhone?: string | null }
) {
  const { data } = await apiFetch<ListingDetail>(`/api/v1/admin/listings/${kind}s/${id}`, { method: "PATCH", token, body: patch });
  return data;
}

export async function deleteListing(token: string, kind: ListingKind, id: string) {
  await apiFetch<{ deleted: boolean }>(`/api/v1/admin/listings/${kind}s/${id}`, { method: "DELETE", token });
}

// --- Tenants (platform admin): edit + users of one tenant ---
export async function listTenantUsers(token: string, tenantId: string, page = 1, pageSize = 50) {
  const { data, meta } = await apiFetch<AdminUser[]>(
    `/api/v1/auth/admin/users?tenantId=${tenantId}&page=${page}&pageSize=${pageSize}`,
    { token }
  );
  return { items: data, meta };
}

// --- Bookings: edit non-financial details ---
export async function updateAdminBooking(
  token: string,
  id: string,
  patch: { contactEmail?: string; contactPhone?: string; specialRequests?: string | null; travelDate?: string }
) {
  const { data } = await apiFetch<AdminBooking>(`/api/v1/bookings/admin/${id}`, { method: "PATCH", token, body: patch });
  return data;
}

/**
 * Uploads a listing's featured image straight to storage (two steps: a signed upload URL from the media service,
 * then a PUT) and returns the storage key to save on the listing. Throws an Error fit to show the admin.
 */
export async function uploadListingImage(token: string, kind: "destination" | "package", file: File, onProgress?: (fraction: number) => void): Promise<string> {
  const TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];
  const MAX = 10 * 1024 * 1024;
  if (!TYPES.includes(file.type)) throw new Error("Please choose a JPG, PNG, WebP or AVIF image.");
  if (file.size > MAX) throw new Error(`That image is ${(file.size / (1024 * 1024)).toFixed(1)}MB. The limit is 10MB.`);
  const { data } = await apiFetch<{ uploadUrl: string; storageKey: string; requiredHeaders?: Record<string, string> }>("/api/v1/media/upload-url", {
    method: "POST",
    token,
    body: { category: kind === "destination" ? "destination_image" : "package_image", fileName: file.name.slice(0, 255), contentType: file.type, sizeBytes: file.size },
  });
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", data.uploadUrl);
    for (const [k, v] of Object.entries(data.requiredHeaders ?? { "Content-Type": file.type })) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded / e.total);
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status}). Please try again.`)));
    xhr.onerror = () => reject(new Error("Upload failed - check your connection and try again."));
    xhr.send(file);
  });
  return data.storageKey;
}

export async function updateBookingTraveler(token: string, bookingId: string, travelerLineId: string, patch: Record<string, unknown>) {
  const { data } = await apiFetch<Record<string, any>>(`/api/v1/bookings/admin/${bookingId}/travelers/${travelerLineId}`, { method: "PATCH", token, body: patch });
  return data;
}

// --- Restore soft-deleted records ---
export async function restoreUser(token: string, id: string) {
  await apiFetch(`/api/v1/auth/admin/users/${id}/restore`, { method: "POST", token });
}

export async function listDeletedOperators(token: string) {
  const { data } = await apiFetch<Operator[]>("/api/v1/operators/deleted", { token });
  return data;
}

export async function restoreOperator(token: string, id: string) {
  await apiFetch(`/api/v1/operators/${id}/restore`, { method: "POST", token });
}

export async function restoreListing(token: string, kind: ListingKind, id: string) {
  await apiFetch(`/api/v1/admin/listings/${kind}s/${id}/restore`, { method: "POST", token });
}

// ===================== Records: history, payments, invoices, reviews, coupons, promotions, listing detail =====================
type Row = Record<string, any>;
const qsOf = (o: Record<string, string | number | boolean | undefined>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== "" && v !== false) p.set(k, String(v));
  return p.toString();
};

// --- History of any record ---
export type HistoryType = "user" | "operator" | "booking" | "destination" | "package" | "accommodation" | "transport" | "coupon" | "promotion" | "review";
export interface HistoryEntry {
  id: string;
  action: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  actorUserId: string | null;
  actorEmail: string | null;
  actorFirstName: string | null;
  actorLastName: string | null;
}
export async function listHistory(token: string, resourceType: HistoryType, resourceId: string, page = 1) {
  const { data, meta } = await apiFetch<HistoryEntry[]>(`/api/v1/admin/records/history?${qsOf({ resourceType, resourceId, page, pageSize: 15 })}`, { token });
  return { items: data, meta };
}

// --- Payments & invoices ---
export interface PaymentRow {
  id: string;
  bookingId: string;
  provider: string;
  status: string;
  originalAmount: string;
  originalCurrency: string;
  baseCurrencyAmount: string;
  baseCurrency: string;
  providerReceipt: string | null;
  createdAt: string;
}
export async function listPaymentsAdmin(token: string, p: { page?: number; status?: string; provider?: string; search?: string } = {}) {
  const { data, meta } = await apiFetch<PaymentRow[]>(`/api/v1/admin/records/payments?${qsOf({ pageSize: 25, ...p })}`, { token });
  return { items: data, meta };
}
export interface PaymentDetail extends PaymentRow {
  exchangeRate: string | null;
  transactions: Row[];
  refunds: Row[];
  booking: { id: string; status: string; contactEmail: string; userId: string; totalAmount: string; amountPaid: string; currency: string } | null;
}
export async function getPaymentDetail(token: string, id: string) {
  const { data } = await apiFetch<PaymentDetail>(`/api/v1/admin/records/payments/${id}`, { token });
  return data;
}
export interface InvoiceRow {
  id: string;
  invoiceNumber: string;
  bookingId: string;
  contactEmail: string | null;
  totalAmount: string;
  amountPaid: string;
  balanceDue: string;
  currency: string;
  createdAt: string;
}
export async function listInvoicesAdmin(token: string, p: { page?: number; search?: string; unpaidOnly?: boolean } = {}) {
  const { data, meta } = await apiFetch<InvoiceRow[]>(`/api/v1/admin/records/invoices?${qsOf({ pageSize: 25, ...p, unpaidOnly: p.unpaidOnly ? "true" : undefined })}`, { token });
  return { items: data, meta };
}
export async function listTenantBillingEvents(token: string, tenantId: string) {
  const { data } = await apiFetch<{ id: string; type: string; outcome: string | null; createdAt: string }[]>(`/api/v1/admin/records/tenants/${tenantId}/billing-events`, { token });
  return data;
}

// --- Reviews (every status) ---
export interface ReviewRow {
  id: string;
  userId: string;
  userEmail: string | null;
  userFirstName: string | null;
  userLastName: string | null;
  bookingId: string | null;
  subjectType: string;
  subjectId: string;
  rating: number;
  title: string | null;
  body: string | null;
  status: string;
  reportCount: number;
  operatorResponse: string | null;
  createdAt: string;
}
export async function listReviewsAdmin(token: string, p: { page?: number; status?: string; rating?: number; reportedOnly?: boolean; search?: string } = {}) {
  const { data, meta } = await apiFetch<ReviewRow[]>(`/api/v1/admin/records/reviews?${qsOf({ pageSize: 20, ...p, reportedOnly: p.reportedOnly ? "true" : undefined })}`, { token });
  return { items: data, meta };
}

// --- Coupons & promotions ---
export interface Coupon {
  id: string;
  code: string;
  discountType: "percentage" | "fixed_amount";
  discountValue: string;
  currency: string | null;
  maxUses: number | null;
  usedCount: number;
  minBookingAmount: string | null;
  validFrom: string | null;
  validUntil: string | null;
  isActive: boolean;
}
export type CouponInput = {
  code: string;
  discountType: "percentage" | "fixed_amount";
  discountValue: number;
  currency?: string | null;
  maxUses?: number | null;
  minBookingAmount?: number | null;
  validFrom?: string | null;
  validUntil?: string | null;
  isActive?: boolean;
};
export async function listCoupons(token: string, p: { page?: number; search?: string } = {}) {
  const { data, meta } = await apiFetch<Coupon[]>(`/api/v1/admin/records/coupons?${qsOf({ pageSize: 25, ...p })}`, { token });
  return { items: data, meta };
}
export async function createCoupon(token: string, body: CouponInput) {
  const { data } = await apiFetch<Coupon>("/api/v1/admin/records/coupons", { method: "POST", token, body });
  return data;
}
export async function updateCoupon(token: string, id: string, body: Partial<CouponInput>) {
  const { data } = await apiFetch<Coupon>(`/api/v1/admin/records/coupons/${id}`, { method: "PATCH", token, body });
  return data;
}
export async function deleteCoupon(token: string, id: string) {
  await apiFetch(`/api/v1/admin/records/coupons/${id}`, { method: "DELETE", token });
}

export interface PromotionRule { id: string; conditionKey: string; conditionValue: string; discountType: string; discountValue: string }
export interface Promotion {
  id: string;
  name: string;
  type: string;
  description: string | null;
  startsAt: string | null;
  endsAt: string | null;
  isActive: boolean;
  rules: PromotionRule[];
}
export type PromotionInput = {
  name: string;
  type: string;
  description?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  isActive?: boolean;
  rules?: { conditionKey: string; conditionValue: string; discountType: string; discountValue: number }[];
};
export async function listPromotions(token: string) {
  const { data } = await apiFetch<Promotion[]>("/api/v1/admin/records/promotions", { token });
  return data;
}
export async function createPromotion(token: string, body: PromotionInput) {
  const { data } = await apiFetch<Promotion>("/api/v1/admin/records/promotions", { method: "POST", token, body });
  return data;
}
export async function updatePromotion(token: string, id: string, body: Partial<Omit<PromotionInput, "rules">>) {
  const { data } = await apiFetch<Promotion>(`/api/v1/admin/records/promotions/${id}`, { method: "PATCH", token, body });
  return data;
}
export async function deletePromotion(token: string, id: string) {
  await apiFetch(`/api/v1/admin/records/promotions/${id}`, { method: "DELETE", token });
}
export async function addPromotionRule(token: string, id: string, body: { conditionKey: string; conditionValue: string; discountType: string; discountValue: number }) {
  const { data } = await apiFetch<PromotionRule>(`/api/v1/admin/records/promotions/${id}/rules`, { method: "POST", token, body });
  return data;
}
export async function deletePromotionRule(token: string, ruleId: string) {
  await apiFetch(`/api/v1/admin/records/promotion-rules/${ruleId}`, { method: "DELETE", token });
}

// --- Everything linked to one user / operator ---
export interface UserOverview {
  bookings: { id: string; status: string; travelDate: string; totalAmount: string; amountPaid: string; currency: string; packageName: string | null; createdAt: string }[];
  payments: { id: string; bookingId: string; provider: string; status: string; originalAmount: string; originalCurrency: string; createdAt: string }[];
  travelers: { id: string; firstName: string; lastName: string; dateOfBirth: string | null; nationality: string | null; email: string | null; phone: string | null; hasPassport: boolean; passportExpiryDate: string | null; dietaryRequirements: string | null }[];
  reviewCount: number;
}
export async function getUserOverview(token: string, id: string) {
  const { data } = await apiFetch<UserOverview>(`/api/v1/admin/records/users/${id}/overview`, { token });
  return data;
}
export interface OperatorOverview {
  packages: { id: string; name: string; status: string; featured: boolean; durationDays: number; bookings: number }[];
  accommodations: { id: string; name: string; type: string; status: string }[];
  transportProviders: { id: string; name: string; contactPhone: string | null }[];
  recentBookings: { id: string; status: string; travelDate: string; totalAmount: string; currency: string; packageName: string | null; createdAt: string }[];
}
export async function getOperatorOverview(token: string, id: string) {
  const { data } = await apiFetch<OperatorOverview>(`/api/v1/admin/records/operators/${id}/overview`, { token });
  return data;
}

// --- One listing in full + its child records ---
export async function getListingFull(token: string, kind: ListingKind, id: string) {
  const { data } = await apiFetch<Row>(`/api/v1/admin/records/listing/${kind}/${id}`, { token });
  return data;
}
export async function updateListingFields(token: string, kind: ListingKind, id: string, body: Row) {
  const { data } = await apiFetch<Row>(`/api/v1/admin/records/listing/${kind}/${id}`, { method: "PATCH", token, body });
  return data;
}
export type ChildName =
  | "package-prices" | "package-availability" | "package-itinerary" | "package-inclusions" | "package-exclusions"
  | "package-activities" | "room-types" | "rooms" | "vehicles" | "routes";
export async function listChildren(token: string, name: ChildName, parentId: string) {
  const { data } = await apiFetch<Row[]>(`/api/v1/admin/records/children/${name}?parentId=${parentId}`, { token });
  return data;
}
export async function createChild(token: string, name: ChildName, parentId: string, body: Row) {
  const { data } = await apiFetch<Row>(`/api/v1/admin/records/children/${name}`, { method: "POST", token, body: { ...body, parentId } });
  return data;
}
export async function updateChild(token: string, name: ChildName, id: string, body: Row) {
  const { data } = await apiFetch<Row>(`/api/v1/admin/records/children/${name}/${id}`, { method: "PATCH", token, body });
  return data;
}
export async function deleteChild(token: string, name: ChildName, id: string) {
  await apiFetch(`/api/v1/admin/records/children/${name}/${id}`, { method: "DELETE", token });
}

/** Turns an image's storage key into a viewable URL (used for previews). Returns null if it can't be resolved. */
export async function getMediaUrl(token: string, storageKey: string): Promise<string | null> {
  try {
    const { data } = await apiFetch<{ url?: string } | string>(`/api/v1/media/public-url/${storageKey}`, { token });
    return typeof data === "string" ? data : data?.url ?? null;
  } catch {
    return null;
  }
}
