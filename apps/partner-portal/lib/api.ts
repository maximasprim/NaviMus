import { clearSessionMarker, COOKIE_SESSION } from "./session-core";
import { apiFetch } from "./api-client";

export interface Operator {
  id: string;
  businessName: string;
  status: "pending" | "approved" | "rejected" | "suspended";
  contactEmail: string;
  contactPhone?: string;
}

export interface OperatorPackage {
  id: string;
  name: string;
  slug: string;
  type: string;
  status: string;
  durationDays: number;
  createdAt: string;
}

export interface OperatorBooking {
  id: string;
  status: string;
  travelDate: string;
  travelerCount: number;
  totalAmount: string;
  currency: string;
}

export interface Earning {
  currency: string;
  amount: number;
}

export async function registerUser(input: { email: string; password: string; firstName: string; lastName: string }) {
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

export async function registerOperator(
  token: string,
  input: { businessName: string; contactEmail: string; contactPhone?: string; description?: string }
) {
  const { data } = await apiFetch<Operator>("/api/v1/operators", { method: "POST", token, body: input });
  return data;
}

/**
 * GET /operators/me resolves through resolveOperatorForUser, which
 * throws NOT_FOUND if the caller has no operator profile yet, or
 * CONFLICT if one exists but isn't "approved" (pending/rejected/
 * suspended) - it does NOT return null for "no operator yet". The
 * caller distinguishes these via the thrown ApiError's `code`,
 * exactly as the backend models it, rather than papering over the
 * three different states as one falsy value.
 */
export async function getMyApprovedOperator(token: string) {
  const { data } = await apiFetch<Operator>("/api/v1/operators/me", { token });
  return data;
}

export async function listMyPackages(token: string) {
  const { data } = await apiFetch<OperatorPackage[]>("/api/v1/packages/mine", { token });
  return data;
}

export interface CreatePackageInput {
  name: string;
  type: string;
  durationDays: number;
  minGroupSize: number;
  shortDescription?: string;
  destinationIds: string[];
  prices: { travelerType: "adult"; pricingType: "individual"; amount: number; currency: string }[];
}

export async function createPackage(token: string, input: CreatePackageInput) {
  const { data } = await apiFetch<OperatorPackage>("/api/v1/packages", { method: "POST", token, body: input });
  return data;
}

export interface Destination {
  id: string;
  name: string;
}

export async function listDestinations() {
  const { data } = await apiFetch<Destination[]>("/api/v1/destinations");
  return data;
}

export async function listMyBookings(token: string) {
  const { data } = await apiFetch<OperatorBooking[]>("/api/v1/bookings/operator/mine", { token });
  return data;
}

export async function getMyEarnings(token: string) {
  const { data } = await apiFetch<Earning[]>("/api/v1/payments/earnings/me", { token });
  return data;
}

export interface EarningsPoint {
  date: string;
  amount: number;
}

export async function getMyEarningsTimeSeries(token: string) {
  const { data } = await apiFetch<EarningsPoint[]>("/api/v1/payments/earnings/me/timeseries", { token });
  return data;
}

export interface OperatorDocument {
  id: string;
  documentType: string;
  storageKey: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
}

export async function listMyDocuments(token: string, operatorId: string) {
  const { data } = await apiFetch<OperatorDocument[]>(`/api/v1/operators/${operatorId}/documents`, { token });
  return data;
}

export async function requestUploadUrl(token: string, input: { fileName: string; contentType: string; sizeBytes: number }) {
  const { data } = await apiFetch<{ uploadUrl: string; storageKey: string; publicUrl: string }>(
    "/api/v1/media/upload-url",
    { method: "POST", token, body: { category: "operator_document", ...input } }
  );
  return data;
}

export async function submitDocument(token: string, operatorId: string, input: { documentType: string; storageKey: string }) {
  const { data } = await apiFetch<OperatorDocument>(`/api/v1/operators/${operatorId}/documents`, {
    method: "POST",
    token,
    body: input,
  });
  return data;
}

export interface MyReview {
  id: string;
  subjectType: string;
  subjectId: string;
  rating: number;
  title?: string | null;
  body?: string | null;
  operatorResponse?: string | null;
  createdAt: string;
}

/**
 * Reviews attach to a subject (package/destination/accommodation), not
 * directly to an operator, so this filters the public search to
 * subjects the operator's own packages cover - there's no dedicated
 * "my reviews as an operator" endpoint on the reviews service.
 */
export async function listReviewsForPackage(subjectId: string) {
  const { data } = await apiFetch<MyReview[]>(`/api/v1/reviews?subjectType=package&subjectId=${subjectId}`);
  return data;
}

export async function respondToReview(token: string, reviewId: string, response: string) {
  const { data } = await apiFetch<MyReview>(`/api/v1/reviews/${reviewId}/respond`, {
    method: "POST",
    token,
    body: { response },
  });
  return data;
}

export interface CityOption {
  id: string;
  name: string;
  regionName: string;
  countryName: string;
  countryIsoCode: string;
}

export async function listCities() {
  const { data } = await apiFetch<CityOption[]>("/api/v1/destinations/cities");
  return data;
}

// --- Accommodation management (spec section 28) ---
export interface OperatorAccommodation {
  id: string;
  name: string;
  slug: string;
  type: string;
  status: string;
  cityId: string;
  createdAt: string;
}

export async function listMyAccommodations(token: string) {
  const { data } = await apiFetch<OperatorAccommodation[]>("/api/v1/accommodations/mine", { token });
  return data;
}

export async function createAccommodation(
  token: string,
  input: { cityId: string; name: string; type: string; description?: string; starRating?: number }
) {
  const { data } = await apiFetch<OperatorAccommodation>("/api/v1/accommodations", { method: "POST", token, body: input });
  return data;
}

export async function addRoomType(
  token: string,
  accommodationId: string,
  input: { name: string; maxOccupancy: number; basePricePerNight: number; currency: string; mealPlan?: string }
) {
  const { data } = await apiFetch(`/api/v1/accommodations/${accommodationId}/room-types`, {
    method: "POST",
    token,
    body: input,
  });
  return data;
}

// --- Vehicle management (spec section 11) ---
export interface VehicleType {
  id: string;
  code: string;
  name: string;
  defaultCapacity: number | null;
}

export interface OperatorVehicle {
  id: string;
  vehicleTypeId: string;
  name: string | null;
  registrationNumber: string | null;
  capacity: number;
}

export async function listVehicleTypes() {
  const { data } = await apiFetch<VehicleType[]>("/api/v1/transport/vehicle-types");
  return data;
}

export async function listMyVehicles(token: string) {
  const { data } = await apiFetch<OperatorVehicle[]>("/api/v1/transport/vehicles/mine", { token });
  return data;
}

export async function addVehicle(
  token: string,
  input: { vehicleTypeId: string; name?: string; registrationNumber?: string; capacity: number }
) {
  const { data } = await apiFetch<OperatorVehicle>("/api/v1/transport/vehicles", { method: "POST", token, body: input });
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
