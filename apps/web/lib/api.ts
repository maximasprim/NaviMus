import { clearSessionMarker, COOKIE_SESSION } from "./session-core";
import { apiFetch } from "./api-client";

export interface Destination {
  id: string;
  name: string;
  slug: string;
  shortDescription?: string;
  bestTimeToVisit?: string;
  featured: boolean;
  latitude?: number | null;
  longitude?: number | null;
}

export interface PackagePrice {
  travelerType: "adult" | "child" | "infant";
  pricingType: string;
  amount: string;
  currency: string;
}

export interface TravelPackage {
  id: string;
  name: string;
  slug: string;
  type: string;
  shortDescription?: string;
  description?: string;
  durationDays: number;
  minGroupSize: number;
  maxGroupSize?: number;
  baseCurrency: string;
  featured: boolean;
  seoTitle?: string | null;
  seoDescription?: string | null;
  prices?: PackagePrice[];
  itineraries?: { dayNumber: number; title?: string; description?: string }[];
  inclusions?: { label: string }[];
  exclusions?: { label: string }[];
}

export interface Quote {
  lineItems: { travelerType: string; count: number; unitPrice: number; subtotal: number; currency: string }[];
  subtotal: number;
  currency: string;
  /** Present only when a displayCurrency was requested and differs from `currency`. Estimate only - never the amount actually charged. */
  display?: { amount: number; currency: string; rate: number };
}

export interface Booking {
  id: string;
  status: string;
  travelDate: string;
  travelerCount: number;
  totalAmount: string;
  currency: string;
  contactEmail: string;
  packageId?: string | null;
}

export async function listDestinations(params: { featured?: boolean; q?: string } = {}, tenantSlug?: string) {
  const qs = new URLSearchParams();
  if (params.featured) qs.set("featured", "true");
  if (params.q) qs.set("q", params.q);
  const { data } = await apiFetch<Destination[]>(`/api/v1/destinations?${qs.toString()}`, { tenantSlug });
  return data;
}

export async function getDestination(slug: string, tenantSlug?: string) {
  const { data } = await apiFetch<Destination>(`/api/v1/destinations/${slug}`, { tenantSlug });
  return data;
}

/**
 * Pages through the public destination search (capped at 5 pages / 500
 * items - the API's per-page max is 100) to build the sitemap. A
 * catalog past that size should switch this to a dedicated
 * `/sitemap-destinations.xml` index, but is far beyond this platform's
 * current scale.
 */
export async function listAllDestinationSlugs(tenantSlug?: string): Promise<string[]> {
  const slugs: string[] = [];
  for (let page = 1; page <= 5; page++) {
    const { data, meta } = await apiFetch<Destination[]>(`/api/v1/destinations?page=${page}&pageSize=100`, { tenantSlug });
    slugs.push(...data.map((d) => d.slug));
    if (!meta || slugs.length >= (meta.total ?? 0)) break;
  }
  return slugs;
}

export async function listPackages(params: { featured?: boolean; q?: string } = {}, tenantSlug?: string) {
  const qs = new URLSearchParams();
  if (params.featured) qs.set("featured", "true");
  if (params.q) qs.set("q", params.q);
  const { data } = await apiFetch<TravelPackage[]>(`/api/v1/packages?${qs.toString()}`, { tenantSlug });
  return data;
}

export async function getPackage(slug: string, tenantSlug?: string) {
  const { data } = await apiFetch<TravelPackage>(`/api/v1/packages/${slug}`, { tenantSlug });
  return data;
}

/** See listAllDestinationSlugs's doc comment - same pagination cap and rationale. */
export async function listAllPackageSlugs(tenantSlug?: string): Promise<string[]> {
  const slugs: string[] = [];
  for (let page = 1; page <= 5; page++) {
    const { data, meta } = await apiFetch<TravelPackage[]>(`/api/v1/packages?page=${page}&pageSize=100`, { tenantSlug });
    slugs.push(...data.map((p) => p.slug));
    if (!meta || slugs.length >= (meta.total ?? 0)) break;
  }
  return slugs;
}

export async function getPackageQuote(
  packageId: string,
  travelDate: string,
  travelers: { adults: number; children: number; infants: number },
  displayCurrency?: string,
  tenantSlug?: string
) {
  const qs = new URLSearchParams({
    travelDate,
    adults: String(travelers.adults),
    children: String(travelers.children),
    infants: String(travelers.infants),
  });
  if (displayCurrency) qs.set("displayCurrency", displayCurrency);
  const { data } = await apiFetch<Quote>(`/api/v1/packages/${packageId}/quote?${qs.toString()}`, { tenantSlug });
  return data;
}

/**
 * Self-serve tenant signup - a business creating its own account, not a
 * customer registering for one that already exists (see `register`
 * above). Hits /api/v1/signup, which the gateway exempts from tenant
 * resolution entirely (there's no tenant yet - this is how one gets
 * created), so this deliberately skips the X-Tenant-Slug header the
 * rest of this file's calls send automatically.
 */
export async function signUpBusiness(input: {
  name: string;
  slug?: string;
  ownerEmail: string;
  ownerPassword: string;
  ownerFirstName: string;
  ownerLastName: string;
  ownerPhone?: string;
}) {
  // No tenantSlug passed - whatever gets auto-detected is harmless here
  // since the gateway ignores tenant headers entirely for /api/v1/signup/*.
  const { data } = await apiFetch<{ id: string; slug: string; status: string }>("/api/v1/signup/tenant", {
    method: "POST",
    body: input,
  });
  return data;
}

export async function register(input: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}) {
  const { data } = await apiFetch<{ userId: string }>("/api/v1/auth/register", { method: "POST", body: input });
  return data;
}

export async function login(input: { email: string; password: string }) {
  const { data } = await apiFetch<{ authenticated: boolean }>("/api/v1/auth/login", {
    method: "POST",
    body: input,
  });
  return data;
}

export async function requestPasswordReset(email: string) {
  const { data } = await apiFetch<{ message: string }>("/api/v1/auth/password/forgot", {
    method: "POST",
    body: { email },
  });
  return data;
}

export async function resetPassword(token: string, newPassword: string) {
  const { data } = await apiFetch<{ message: string }>("/api/v1/auth/password/reset", {
    method: "POST",
    body: { token, newPassword },
  });
  return data;
}

export async function verifyEmail(token: string) {
  const { data } = await apiFetch<{ message: string }>("/api/v1/auth/email/verify", {
    method: "POST",
    body: { token },
  });
  return data;
}

export async function resendVerificationEmail(token: string) {
  const { data } = await apiFetch<{ message: string }>("/api/v1/auth/email/resend-verification", {
    method: "POST",
    token,
  });
  return data;
}

export async function createBooking(
  token: string,
  idempotencyKey: string,
  input: {
    packageId: string;
    travelDate: string;
    travelers: { travelerType: "adult" | "child" | "infant" }[];
    contactEmail: string;
    contactPhone: string;
  }
) {
  const { data } = await apiFetch<Booking>("/api/v1/bookings", {
    method: "POST",
    token,
    idempotencyKey,
    body: input,
  });
  return data;
}

export async function createPaymentIntent(
  token: string,
  input: { bookingId: string; provider: "mpesa" | "stripe"; phoneNumber?: string }
) {
  const { data } = await apiFetch<{ id: string; status: string; providerReference?: string }>(
    "/api/v1/payments/intents",
    { method: "POST", token, body: input }
  );
  return data;
}

export async function listMyBookings(token: string) {
  const { data } = await apiFetch<Booking[]>("/api/v1/bookings", { token });
  return data;
}

export async function getBooking(token: string, id: string) {
  const { data } = await apiFetch<Booking & { items: any[]; travelers: any[]; statusHistory: any[] }>(
    `/api/v1/bookings/${id}`,
    { token }
  );
  return data;
}

export interface AppNotification {
  id: string;
  templateKey: string;
  channel: string;
  status: string;
  recipient: string;
  readAt: string | null;
  createdAt: string;
}

export async function listMyNotifications(token: string, page = 1, pageSize = 20) {
  const { data, meta } = await apiFetch<AppNotification[]>(
    `/api/v1/notifications?page=${page}&pageSize=${pageSize}`,
    { token }
  );
  return { items: data, meta };
}

export async function markNotificationRead(token: string, id: string) {
  const { data } = await apiFetch<{ message: string }>(`/api/v1/notifications/${id}/read`, {
    method: "PATCH",
    token,
  });
  return data;
}

export async function markAllNotificationsRead(token: string) {
  const { data } = await apiFetch<{ message: string }>("/api/v1/notifications/read-all", {
    method: "POST",
    token,
  });
  return data;
}

export interface CurrentUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  nationality?: string | null;
  emailVerifiedAt?: string | null;
}

export async function getCurrentUser(token: string) {
  const { data } = await apiFetch<CurrentUser>("/api/v1/auth/me", { token });
  return data;
}

export interface Invoice {
  id: string;
  bookingId: string;
  invoiceNumber: string;
  totalAmount: string;
  amountPaid: string;
  balanceDue: string;
  currency: string;
  createdAt: string;
  travelDate: string;
}

export async function listMyInvoices(token: string, page = 1, pageSize = 20) {
  const { data, meta } = await apiFetch<Invoice[]>(`/api/v1/payments/invoices?page=${page}&pageSize=${pageSize}`, {
    token,
  });
  return { items: data, meta };
}

export async function getInvoice(token: string, id: string) {
  const { data } = await apiFetch<Invoice>(`/api/v1/payments/invoices/${id}`, { token });
  return data;
}

export interface Favorite {
  id: string;
  subjectType: "destination" | "package" | "accommodation";
  subjectId: string;
  createdAt: string;
}

export async function listMyFavorites(token: string) {
  const { data } = await apiFetch<Favorite[]>("/api/v1/account/favorites", { token });
  return data;
}

export async function addFavorite(token: string, subjectType: Favorite["subjectType"], subjectId: string) {
  const { data } = await apiFetch<{ message: string }>("/api/v1/account/favorites", {
    method: "POST",
    token,
    body: { subjectType, subjectId },
  });
  return data;
}

export async function removeFavorite(token: string, subjectType: Favorite["subjectType"], subjectId: string) {
  const { data } = await apiFetch<{ message: string }>("/api/v1/account/favorites", {
    method: "DELETE",
    token,
    body: { subjectType, subjectId },
  });
  return data;
}

export interface SupportTicket {
  id: string;
  bookingId?: string | null;
  subject: string;
  status: "open" | "in_progress" | "resolved" | "closed";
  priority: string;
  createdAt: string;
  updatedAt: string;
}

export interface SupportMessage {
  id: string;
  senderUserId: string;
  body: string;
  createdAt: string;
}

export async function listMySupportTickets(token: string) {
  const { data } = await apiFetch<SupportTicket[]>("/api/v1/account/support-tickets", { token });
  return data;
}

export async function createSupportTicket(token: string, input: { subject: string; message: string; bookingId?: string }) {
  const { data } = await apiFetch<SupportTicket>("/api/v1/account/support-tickets", {
    method: "POST",
    token,
    body: input,
  });
  return data;
}

export async function getSupportTicket(token: string, id: string) {
  const { data } = await apiFetch<SupportTicket & { messages: SupportMessage[] }>(
    `/api/v1/account/support-tickets/${id}`,
    { token }
  );
  return data;
}

export async function addSupportMessage(token: string, id: string, message: string) {
  const { data } = await apiFetch<SupportMessage>(`/api/v1/account/support-tickets/${id}/messages`, {
    method: "POST",
    token,
    body: { message },
  });
  return data;
}

export interface TravelerProfile {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth?: string | null;
  gender?: string | null;
  nationality?: string | null;
  passportExpiryDate?: string | null;
  phone?: string | null;
  email?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  dietaryRequirements?: string | null;
  accessibilityRequirements?: string | null;
  hasPassportOnFile?: boolean;
}

export interface TravelerInput {
  firstName: string;
  lastName: string;
  dateOfBirth?: string;
  gender?: string;
  nationality?: string;
  passportNumber?: string;
  passportExpiryDate?: string;
  phone?: string;
  email?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  dietaryRequirements?: string;
  accessibilityRequirements?: string;
}

export async function listMyTravelers(token: string) {
  const { data } = await apiFetch<TravelerProfile[]>("/api/v1/account/travelers", { token });
  return data;
}

export async function createTraveler(token: string, input: TravelerInput) {
  const { data } = await apiFetch<TravelerProfile>("/api/v1/account/travelers", { method: "POST", token, body: input });
  return data;
}

export async function deleteTraveler(token: string, id: string) {
  const { data } = await apiFetch<{ message: string }>(`/api/v1/account/travelers/${id}`, {
    method: "DELETE",
    token,
  });
  return data;
}

export interface Review {
  id: string;
  subjectType: string;
  subjectId: string;
  rating: number;
  title?: string | null;
  body?: string | null;
  status: string;
  operatorResponse?: string | null;
  createdAt: string;
}

export async function listMyReviews(token: string) {
  const { data } = await apiFetch<Review[]>("/api/v1/reviews/mine", { token });
  return data;
}

export async function createReview(
  token: string,
  input: { bookingId: string; subjectType: string; subjectId: string; rating: number; title?: string; body?: string }
) {
  const { data } = await apiFetch<Review>("/api/v1/reviews", { method: "POST", token, body: input });
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
