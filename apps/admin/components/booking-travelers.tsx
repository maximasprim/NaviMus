"use client";

import { useState } from "react";
import { updateBookingTraveler } from "@/lib/api";
import { getToken } from "@/lib/session";
import { Btn, Card, Modal, Notice, errMsg } from "@/components/detail-ui";
import { FieldInput, initialValues, toPayload, type FieldDef, type FormValues } from "@/components/record-fields";

const FIELDS: FieldDef[] = [
  { key: "firstName", label: "First name", type: "text", required: true },
  { key: "lastName", label: "Last name", type: "text", required: true },
  { key: "dateOfBirth", label: "Date of birth", type: "date" },
  { key: "gender", label: "Gender", type: "text" },
  { key: "nationality", label: "Nationality (2-letter code)", type: "text", placeholder: "KE" },
  { key: "passportExpiryDate", label: "Passport expiry", type: "date", help: "Passport numbers are encrypted and can only be entered by the traveler." },
  { key: "phone", label: "Phone", type: "text" },
  { key: "email", label: "Email", type: "text" },
  { key: "emergencyContactName", label: "Emergency contact", type: "text" },
  { key: "emergencyContactPhone", label: "Emergency contact phone", type: "text" },
  { key: "dietaryRequirements", label: "Dietary requirements", type: "textarea" },
  { key: "accessibilityRequirements", label: "Accessibility requirements", type: "textarea" },
];

/** The people on a booking, with their details. Corrections change the traveler's profile, not the price or the booking's totals. */
export function BookingTravelers({
  bookingId,
  travelers,
  canEdit,
  locked,
  onSaved,
}: {
  bookingId: string;
  travelers: Record<string, any>[];
  canEdit: boolean;
  locked: boolean;
  onSaved: () => void;
}) {
  const [row, setRow] = useState<Record<string, any> | null>(null);
  const [values, setValues] = useState<FormValues>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function open(r: Record<string, any>) {
    setRow(r);
    setValues(initialValues(FIELDS, r));
    setError(null);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!row) return;
    setSaving(true);
    setError(null);
    try {
      // Send only what changed.
      const before = toPayload(FIELDS, initialValues(FIELDS, row), "update");
      const next = toPayload(FIELDS, values, "update");
      const changed = Object.fromEntries(Object.entries(next).filter(([k, v]) => before[k] !== v));
      if (Object.keys(changed).length === 0) {
        setRow(null);
        return;
      }
      await updateBookingTraveler(getToken()!, bookingId, row.id, changed);
      setRow(null);
      onSaved();
    } catch (err) {
      setError(errMsg(err, "Could not save."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-6">
      <Card title={`Travelers (${travelers.length})`}>
        {travelers.length === 0 && <p className="text-sm text-ink/50">No traveler details on this booking.</p>}
        <ul className="divide-y divide-ink-horizon/5">
          {travelers.map((t) => (
            <li key={t.id} className="flex flex-wrap items-start justify-between gap-3 py-3 text-sm">
              <div>
                <p className="text-ink-horizon">
                  {t.firstName ?? "-"} {t.lastName ?? ""} <span className="ml-1 text-xs capitalize text-ink/40">{t.travelerType}</span>
                </p>
                <p className="mt-0.5 text-xs text-ink/50">
                  {[t.nationality, t.dateOfBirth, t.hasPassport ? `passport on file${t.passportExpiryDate ? ` (expires ${t.passportExpiryDate})` : ""}` : null, t.phone, t.email].filter(Boolean).join(" · ") || "No other details"}
                </p>
                {t.dietaryRequirements && <p className="mt-0.5 text-xs text-ink/50">Diet: {t.dietaryRequirements}</p>}
                {t.accessibilityRequirements && <p className="mt-0.5 text-xs text-ink/50">Accessibility: {t.accessibilityRequirements}</p>}
              </div>
              {canEdit && !locked && <Btn onClick={() => open(t)}>Edit</Btn>}
            </li>
          ))}
        </ul>
        {canEdit && locked && <p className="mt-2 text-xs text-ink/40">Details are locked once a booking is completed, cancelled or refunded.</p>}
        {canEdit && !locked && <p className="mt-2 text-xs text-ink/40">Edits change this traveler&apos;s saved profile, so they also appear on the customer&apos;s other bookings. Prices are not affected.</p>}
      </Card>
      {row && (
        <Modal title={`Edit ${row.firstName ?? "traveler"}`} onClose={() => setRow(null)}>
          <form onSubmit={save} className="space-y-3">
            {error && <Notice kind="error">{error}</Notice>}
            {FIELDS.map((f) => (
              <FieldInput key={f.key} field={f} value={values[f.key] ?? ""} onChange={(v) => setValues((s) => ({ ...s, [f.key]: v }))} />
            ))}
            <div className="flex justify-end gap-2 pt-2">
              <Btn type="button" onClick={() => setRow(null)}>Cancel</Btn>
              <Btn type="submit" tone="primary" disabled={saving}>{saving ? "Saving…" : "Save"}</Btn>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
