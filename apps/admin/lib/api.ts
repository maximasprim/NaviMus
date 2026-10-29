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
  contactPhone?: string;
  createdAt: string;
}

export async function login(input: { email: string; password: string; workspace: string }) {
  const { workspace, ...credentials } = input;
  const { data } = await apiFetch<{ authenticated: boolean }>("/api/v1/auth/login", {
    method: "POST",
    body: credentials,
    tenantSlug: workspace.trim().toLowerCase(),
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

export async function listPendingOperators(token: string) {
  const { data } = await apiFetch<Operator[]>(`/api/v1/operators?status=pending`, { token });
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
}

export async function listUsers(token: string, page = 1, pageSize = 20, search?: string) {
  const qs = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (search) qs.set("search", search);
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

export async function listAllSupportTickets(token: string, status?: string) {
  const qs = status ? `?status=${status}` : "";
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
