"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getToken } from "@/lib/session";
import { listMyTravelers, createTraveler, deleteTraveler, type TravelerProfile, type TravelerInput } from "@/lib/api";
import { ApiError } from "@/lib/api-client";

const EMPTY_FORM: TravelerInput = { firstName: "", lastName: "" };

export default function TravelersPage() {
  const router = useRouter();
  const [travelers, setTravelers] = useState<TravelerProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<TravelerInput>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.push("/login");
      return;
    }
    listMyTravelers(token)
      .then(setTravelers)
      .finally(() => setLoading(false));
  }, [router]);

  function update<K extends keyof TravelerInput>(key: K, value: TravelerInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token) return;
    setError(null);
    setSubmitting(true);
    try {
      const traveler = await createTraveler(token, form);
      setTravelers((prev) => [...prev, traveler]);
      setForm(EMPTY_FORM);
      setShowForm(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save that profile - try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    const token = getToken();
    if (!token) return;
    await deleteTraveler(token, id);
    setTravelers((prev) => prev.filter((t) => t.id !== id));
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <Link href="/dashboard" className="text-sm text-acacia underline">
        ← Back to account
      </Link>
      <div className="mt-4 flex items-center justify-between">
        <h1 className="font-display text-3xl text-ink-horizon">Travelers</h1>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="rounded-full bg-ink-horizon px-4 py-2 text-sm font-medium text-sand-light hover:bg-acacia"
        >
          {showForm ? "Cancel" : "Add traveler"}
        </button>
      </div>
      <p className="mt-2 text-sm text-ink/60">
        Save details for people you often travel with so checkout goes faster.
      </p>

      {showForm && (
        <form onSubmit={handleSubmit} className="mt-6 space-y-4 rounded-2xl border border-ink-horizon/15 p-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-ink/80">First name</label>
              <input
                required
                value={form.firstName}
                onChange={(e) => update("firstName", e.target.value)}
                className="mt-1 w-full rounded-lg border border-ink-horizon/20 bg-sand-light px-4 py-2.5 text-ink"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink/80">Last name</label>
              <input
                required
                value={form.lastName}
                onChange={(e) => update("lastName", e.target.value)}
                className="mt-1 w-full rounded-lg border border-ink-horizon/20 bg-sand-light px-4 py-2.5 text-ink"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink/80">Date of birth</label>
              <input
                type="date"
                value={form.dateOfBirth ?? ""}
                onChange={(e) => update("dateOfBirth", e.target.value || undefined)}
                className="mt-1 w-full rounded-lg border border-ink-horizon/20 bg-sand-light px-4 py-2.5 text-ink"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink/80">Nationality (2-letter code)</label>
              <input
                maxLength={2}
                placeholder="KE"
                value={form.nationality ?? ""}
                onChange={(e) => update("nationality", e.target.value.toUpperCase() || undefined)}
                className="mt-1 w-full rounded-lg border border-ink-horizon/20 bg-sand-light px-4 py-2.5 text-ink"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink/80">Passport number</label>
              <input
                value={form.passportNumber ?? ""}
                onChange={(e) => update("passportNumber", e.target.value || undefined)}
                className="mt-1 w-full rounded-lg border border-ink-horizon/20 bg-sand-light px-4 py-2.5 text-ink"
              />
              <p className="mt-1 text-xs text-ink/40">Encrypted at rest. Only enter this if a trip requires it.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-ink/80">Dietary requirements</label>
              <input
                value={form.dietaryRequirements ?? ""}
                onChange={(e) => update("dietaryRequirements", e.target.value || undefined)}
                className="mt-1 w-full rounded-lg border border-ink-horizon/20 bg-sand-light px-4 py-2.5 text-ink"
              />
            </div>
          </div>
          {error && <p className="text-sm text-plum">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="rounded-full bg-ink-horizon px-6 py-2.5 text-sm font-semibold text-sand-light hover:bg-acacia disabled:opacity-50"
          >
            {submitting ? "Saving…" : "Save traveler"}
          </button>
        </form>
      )}

      {loading && <p className="mt-8 text-ink/50">Loading…</p>}
      {!loading && travelers.length === 0 && !showForm && (
        <p className="mt-8 text-ink/50">No saved travelers yet.</p>
      )}

      <ul className="mt-6 divide-y divide-ink-horizon/10">
        {travelers.map((t) => (
          <li key={t.id} className="flex items-center justify-between py-4">
            <div>
              <p className="font-medium text-ink-horizon">
                {t.firstName} {t.lastName}
              </p>
              <p className="mt-0.5 text-xs text-ink/50">
                {t.nationality ?? "-"} {t.hasPassportOnFile ? "· Passport on file" : ""}
              </p>
            </div>
            <button onClick={() => handleDelete(t.id)} className="text-sm text-plum underline">
              Remove
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
