"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getListingFull, getMediaUrl, updateListingFields, uploadListingImage, type ListingKind } from "@/lib/api";
import { getToken } from "@/lib/session";
import { useCan } from "@/lib/access";
import { ACTIONS } from "@/lib/access-rules";
import { Btn, Card, KV, Notice, PageHeader, StatusBadge, errMsg } from "@/components/detail-ui";
import { FieldInput, initialValues, toPayload, type FieldDef, type FormValues } from "@/components/record-fields";
import { RecordSection } from "@/components/record-section";
import { HistoryCard } from "@/components/history-card";

const STATUS_OPTIONS = ["draft", "pending_review", "published", "rejected", "archived"].map((v) => ({ value: v, label: v.replace(/_/g, " ") }));
const MEAL_PLANS = ["room_only", "breakfast", "half_board", "full_board", "all_inclusive"].map((v) => ({ value: v, label: v.replace(/_/g, " ") }));
const CURRENCY_OPTIONS = ["KES", "USD", "EUR", "GBP", "TZS", "UGX", "AED", "ZAR"].map((v) => ({ value: v, label: v }));

const KIND_LABEL: Record<ListingKind, string> = { destination: "Destination", package: "Package", accommodation: "Accommodation", transport: "Transport provider" };

/** The listing's own fields, per kind. */
const DETAIL_FIELDS: Record<ListingKind, FieldDef[]> = {
  destination: [
    { key: "name", label: "Name", type: "text", required: true },
    { key: "status", label: "Status", type: "select", required: true, options: STATUS_OPTIONS },
    { key: "featured", label: "Featured on the storefront", type: "checkbox" },
    { key: "shortDescription", label: "Short description", type: "text" },
    { key: "description", label: "Description", type: "textarea" },
    { key: "bestTimeToVisit", label: "Best time to visit", type: "text" },
    { key: "timezone", label: "Timezone", type: "text", placeholder: "Africa/Nairobi" },
    { key: "averageDurationHours", label: "Average visit (hours)", type: "number" },
    { key: "minimumAge", label: "Minimum age", type: "number" },
    { key: "maximumCapacity", label: "Maximum capacity", type: "number" },
    { key: "entryRequirements", label: "Entry requirements", type: "textarea" },
    { key: "safetyInformation", label: "Safety information", type: "textarea" },
    { key: "travelInformation", label: "Travel information", type: "textarea" },
    { key: "weatherInformation", label: "Weather information", type: "textarea" },
    { key: "accessibilityInformation", label: "Accessibility information", type: "textarea" },
  ],
  package: [
    { key: "name", label: "Name", type: "text", required: true },
    { key: "status", label: "Status", type: "select", required: true, options: STATUS_OPTIONS },
    { key: "featured", label: "Featured on the storefront", type: "checkbox" },
    { key: "shortDescription", label: "Short description", type: "text" },
    { key: "description", label: "Description", type: "textarea" },
    { key: "durationDays", label: "Duration (days)", type: "number", required: true },
    { key: "minGroupSize", label: "Minimum group size", type: "number", required: true },
    { key: "maxGroupSize", label: "Maximum group size", type: "number" },
    { key: "inclusions", label: "Inclusions (summary text)", type: "textarea" },
    { key: "exclusions", label: "Exclusions (summary text)", type: "textarea" },
    { key: "termsAndConditions", label: "Terms and conditions", type: "textarea" },
    { key: "visaInformation", label: "Visa information", type: "textarea" },
    { key: "insuranceInformation", label: "Insurance information", type: "textarea" },
    { key: "seoTitle", label: "SEO title", type: "text" },
    { key: "seoDescription", label: "SEO description", type: "text" },
  ],
  accommodation: [
    { key: "name", label: "Name", type: "text", required: true },
    { key: "status", label: "Status", type: "select", required: true, options: STATUS_OPTIONS },
    { key: "type", label: "Type", type: "text", required: true, placeholder: "hotel, lodge, camp…" },
    { key: "starRating", label: "Star rating (1-5)", type: "number" },
    { key: "checkInTime", label: "Check-in time", type: "time" },
    { key: "checkOutTime", label: "Check-out time", type: "time" },
    { key: "description", label: "Description", type: "textarea" },
  ],
  transport: [
    { key: "name", label: "Name", type: "text", required: true },
    { key: "contactPhone", label: "Contact phone", type: "text" },
  ],
};

const PRICE_FIELDS: FieldDef[] = [
  { key: "travelerType", label: "Traveler", type: "select", required: true, options: [{ value: "adult", label: "Adult" }, { value: "child", label: "Child" }, { value: "infant", label: "Infant" }] },
  { key: "amount", label: "Price", type: "money", required: true },
  { key: "currency", label: "Currency", type: "select", required: true, options: CURRENCY_OPTIONS },
  { key: "pricingType", label: "Pricing type", type: "text", required: true, help: "individual, per group…" },
  { key: "seasonLabel", label: "Season", type: "text", placeholder: "High season" },
  { key: "seasonStartDate", label: "Season starts", type: "date" },
  { key: "seasonEndDate", label: "Season ends", type: "date" },
];
const AVAIL_FIELDS: FieldDef[] = [
  { key: "travelDate", label: "Travel date", type: "date", required: true },
  { key: "totalCapacity", label: "Capacity", type: "number", required: true, help: "Can't go below what's already booked." },
  { key: "bookedCount", label: "Booked", type: "number", tableOnly: true },
  { key: "status", label: "Status", type: "select", required: true, options: [{ value: "open", label: "Open" }, { value: "closed", label: "Closed" }, { value: "sold_out", label: "Sold out" }] },
];
const ITINERARY_FIELDS: FieldDef[] = [
  { key: "dayNumber", label: "Day", type: "number", required: true },
  { key: "title", label: "Title", type: "text" },
  { key: "description", label: "Description", type: "textarea" },
];
const LABEL_FIELDS: FieldDef[] = [{ key: "label", label: "Item", type: "text", required: true }];
const ACTIVITY_FIELDS: FieldDef[] = [
  { key: "name", label: "Activity", type: "text", required: true },
  { key: "description", label: "Description", type: "textarea", hideInTable: true },
  { key: "isOptional", label: "Optional extra", type: "checkbox" },
  { key: "additionalPrice", label: "Extra price", type: "money" },
  { key: "currency", label: "Currency", type: "select", options: CURRENCY_OPTIONS },
];
const ROOM_TYPE_FIELDS: FieldDef[] = [
  { key: "name", label: "Room type", type: "text", required: true },
  { key: "maxOccupancy", label: "Sleeps", type: "number", required: true },
  { key: "basePricePerNight", label: "Price / night", type: "money", required: true },
  { key: "currency", label: "Currency", type: "select", required: true, options: CURRENCY_OPTIONS },
  { key: "mealPlan", label: "Meal plan", type: "select", options: MEAL_PLANS },
];
const ROOM_FIELDS: FieldDef[] = [
  { key: "roomNumber", label: "Room number", type: "text" },
  { key: "isActive", label: "In service", type: "checkbox" },
];
const ROUTE_FIELDS: FieldDef[] = [
  { key: "basePrice", label: "Base price", type: "money", required: true },
  { key: "currency", label: "Currency", type: "select", required: true, options: CURRENCY_OPTIONS },
  { key: "estimatedDurationMinutes", label: "Duration (minutes)", type: "number" },
];

const TABS: Record<ListingKind, string[]> = {
  destination: ["Details", "History"],
  package: ["Details", "Pricing", "Availability", "Itinerary", "Inclusions", "Activities", "History"],
  accommodation: ["Details", "Rooms", "History"],
  transport: ["Details", "Vehicles", "Routes", "History"],
};

type Listing = Record<string, any>;

function isKind(k: string): k is ListingKind {
  return k === "destination" || k === "package" || k === "accommodation" || k === "transport";
}

export default function ListingDetailPage({ params }: { params: { kind: string; id: string } }) {
  const kind = isKind(params.kind) ? params.kind : null;
  const canDest = useCan(ACTIONS.editDestinations);
  const canPkg = useCan(ACTIONS.editPackages);
  const canEdit = kind === "destination" ? canDest : canPkg;

  const [row, setRow] = useState<Listing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [tab, setTab] = useState("Details");
  const [values, setValues] = useState<FormValues>({});
  const [saving, setSaving] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  const fields = kind ? DETAIL_FIELDS[kind] : [];

  const load = useCallback(() => {
    if (!kind) return;
    getListingFull(getToken()!, kind, params.id)
      .then((r) => {
        setRow(r);
        setValues(initialValues(DETAIL_FIELDS[kind], r));
      })
      .catch((e) => setError(errMsg(e, "Could not load this.")));
  }, [kind, params.id]);

  useEffect(load, [load]);

  useEffect(() => {
    setImageUrl(null);
    if (row?.featuredImageKey) getMediaUrl(getToken()!, row.featuredImageKey).then(setImageUrl);
  }, [row?.featuredImageKey]);

  const original = useMemo(() => (row ? toPayload(fields, initialValues(fields, row), "update") : {}), [row, fields]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!kind || !row) return;
    const next = toPayload(fields, values, "update");
    // Send only what changed, so saving doesn't touch (or re-stamp) fields nobody edited.
    const changed = Object.fromEntries(Object.entries(next).filter(([k, v]) => original[k] !== v));
    if (Object.keys(changed).length === 0) {
      setMessage("No changes to save.");
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await updateListingFields(getToken()!, kind, row.id, changed);
      setMessage("Saved.");
      load();
    } catch (err) {
      setError(errMsg(err, "Could not save."));
    } finally {
      setSaving(false);
    }
  }

  const [uploading, setUploading] = useState(false);
  async function uploadImage(file: File) {
    if (!kind || !row || (kind !== "destination" && kind !== "package")) return;
    setUploading(true);
    setError(null);
    setMessage(null);
    try {
      const key = await uploadListingImage(getToken()!, kind, file);
      await updateListingFields(getToken()!, kind, row.id, { featuredImageKey: key });
      setMessage("Image updated.");
      load();
    } catch (err) {
      setError(errMsg(err, "Could not upload the image."));
    } finally {
      setUploading(false);
    }
  }

  async function removeImage() {
    if (!kind || !row || !window.confirm("Remove the featured image?")) return;
    try {
      await updateListingFields(getToken()!, kind, row.id, { featuredImageKey: null });
      setMessage("Image removed.");
      load();
    } catch (err) {
      setError(errMsg(err, "Could not remove the image."));
    }
  }

  if (!kind) return <p className="p-8 text-sm text-ink/60">Unknown listing type.</p>;
  if (!row) {
    return (
      <div className="p-8">
        {error ? <Notice kind="error">{error}</Notice> : <p className="text-sm text-ink/50">Loading…</p>}
        <Link href="/listings" className="mt-4 inline-block text-sm text-acacia">
          ← Back to listings
        </Link>
      </div>
    );
  }

  const tabs = TABS[kind];
  const vehicleTypeOptions = ((row.vehicleTypes as { id: string; name: string }[]) ?? []).map((v) => ({ value: v.id, label: v.name }));
  const vehicleFields: FieldDef[] = [
    { key: "vehicleTypeId", label: "Vehicle type", type: "select", required: true, options: vehicleTypeOptions },
    { key: "name", label: "Name", type: "text" },
    { key: "registrationNumber", label: "Registration", type: "text" },
    { key: "capacity", label: "Seats", type: "number", required: true },
  ];

  return (
    <div className="space-y-6 p-8">
      <PageHeader
        eyebrow={KIND_LABEL[kind]}
        title={row.name}
        badge={row.status ? <StatusBadge value={row.status} /> : undefined}
        back={
          <Link href="/listings" className="text-xs text-ink/50 hover:text-ink-horizon">
            ← All listings
          </Link>
        }
      />
      {error && <Notice kind="error">{error}</Notice>}
      {message && <Notice kind="ok">{message}</Notice>}
      {!canEdit && <p className="text-xs text-ink/50">You can view this but not change it.</p>}

      <div className="flex flex-wrap gap-1 border-b border-ink-horizon/10">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm ${tab === t ? "border-acacia text-ink-horizon" : "border-transparent text-ink/50 hover:text-ink-horizon"}`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Details" && (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Card title="Details">
              <form onSubmit={save} className="space-y-3">
                {fields.map((f) => (
                  <FieldInput key={f.key} field={f} value={values[f.key] ?? ""} disabled={!canEdit} onChange={(v) => setValues((s) => ({ ...s, [f.key]: v }))} />
                ))}
                {canEdit && (
                  <div className="flex justify-end pt-2">
                    <Btn type="submit" tone="primary" disabled={saving}>
                      {saving ? "Saving…" : "Save changes"}
                    </Btn>
                  </div>
                )}
              </form>
            </Card>
          </div>
          <div className="space-y-6">
            <Card title="Overview">
              <dl>
                {row.operator && (
                  <KV label="Operator">
                    <Link href={`/operators/${row.operator.id}`} className="text-acacia hover:underline">
                      {row.operator.businessName}
                    </Link>
                  </KV>
                )}
                {row.city && <KV label="City">{row.city.name}</KV>}
                <KV label="Slug">
                  <span className="font-mono text-xs">{row.slug ?? "-"}</span>
                </KV>
                <KV label="Created">{row.createdAt ? new Date(row.createdAt).toLocaleDateString() : "-"}</KV>
                <KV label="Updated">{row.updatedAt ? new Date(row.updatedAt).toLocaleString() : "-"}</KV>
                {row.publishedAt && <KV label="Published">{new Date(row.publishedAt).toLocaleDateString()}</KV>}
              </dl>
            </Card>
            {(kind === "destination" || kind === "package") && (
              <Card title="Featured image">
                <div className="space-y-3">
                  {row.featuredImageKey ? (
                    imageUrl ? <img src={imageUrl} alt="" className="w-full rounded-lg object-cover" /> : <p className="text-sm text-ink/50">Image set (preview unavailable).</p>
                  ) : (
                    <p className="text-sm text-ink/50">No image yet.</p>
                  )}
                  {canEdit && (
                    <div className="flex flex-wrap items-center gap-2">
                      <label className={`cursor-pointer rounded-full bg-acacia px-3.5 py-1.5 text-xs font-medium text-sand-light hover:bg-acacia/90 ${uploading ? "pointer-events-none opacity-50" : ""}`}>
                        {uploading ? "Uploading…" : row.featuredImageKey ? "Replace image" : "Upload image"}
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/avif"
                          className="hidden"
                          disabled={uploading}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            e.target.value = "";
                            if (f) uploadImage(f);
                          }}
                        />
                      </label>
                      {row.featuredImageKey && (
                        <Btn tone="dangerOutline" onClick={removeImage}>
                          Remove image
                        </Btn>
                      )}
                    </div>
                  )}
                  <p className="text-xs text-ink/40">JPG, PNG, WebP or AVIF, up to 10MB.</p>
                </div>
              </Card>
            )}
          </div>
        </div>
      )}

      {kind === "package" && tab === "Pricing" && (
        <RecordSection title="Prices" name="package-prices" parentId={row.id} fields={PRICE_FIELDS} canEdit={canEdit} defaults={{ pricingType: "individual", currency: "KES" }} hint="Per traveler type, optionally for a season." />
      )}
      {kind === "package" && tab === "Availability" && (
        <RecordSection title="Departure dates" name="package-availability" parentId={row.id} fields={AVAIL_FIELDS} canEdit={canEdit} defaults={{ status: "open" }} hint="A date that already has bookings can't be removed. Close it instead." />
      )}
      {kind === "package" && tab === "Itinerary" && (
        <RecordSection title="Itinerary" name="package-itinerary" parentId={row.id} fields={ITINERARY_FIELDS} canEdit={canEdit} />
      )}
      {kind === "package" && tab === "Inclusions" && (
        <div className="space-y-6">
          <RecordSection title="Included" name="package-inclusions" parentId={row.id} fields={LABEL_FIELDS} canEdit={canEdit} />
          <RecordSection title="Not included" name="package-exclusions" parentId={row.id} fields={LABEL_FIELDS} canEdit={canEdit} />
        </div>
      )}
      {kind === "package" && tab === "Activities" && (
        <RecordSection title="Activities" name="package-activities" parentId={row.id} fields={ACTIVITY_FIELDS} canEdit={canEdit} defaults={{ isOptional: false }} />
      )}

      {kind === "accommodation" && tab === "Rooms" && (
        <RecordSection
          title="Room types"
          name="room-types"
          parentId={row.id}
          fields={ROOM_TYPE_FIELDS}
          canEdit={canEdit}
          defaults={{ maxOccupancy: 2, currency: "KES" }}
          renderExtra={(rt) => (
            <div className="ml-4 border-l-2 border-ink-horizon/10 pl-4">
              <RecordSection title="Rooms" name="rooms" parentId={rt.id} fields={ROOM_FIELDS} canEdit={canEdit} defaults={{ isActive: true }} empty="No individual rooms listed." />
            </div>
          )}
        />
      )}

      {kind === "transport" && tab === "Vehicles" && (
        <RecordSection title="Vehicles" name="vehicles" parentId={row.id} fields={vehicleFields} canEdit={canEdit} />
      )}
      {kind === "transport" && tab === "Routes" && (
        <RecordSection title="Routes" name="routes" parentId={row.id} fields={ROUTE_FIELDS} canEdit={canEdit} canCreate={false} hint="Routes are created by the provider. You can adjust their price and duration or remove them." />
      )}

      {tab === "History" && <HistoryCard resourceType={kind} resourceId={row.id} />}
    </div>
  );
}
