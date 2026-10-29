"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  listMyPackages,
  createPackage,
  listDestinations,
  type OperatorPackage,
  type Destination,
} from "@/lib/api";
import { getToken, isLoggedIn } from "@/lib/session";
import { ApiError } from "@/lib/api-client";

const STATUS_STYLES: Record<string, string> = {
  published: "bg-acacia/10 text-acacia",
  draft: "bg-ink-horizon/5 text-ink/50",
  pending_review: "bg-gold/10 text-gold-deep",
  rejected: "bg-plum/10 text-plum",
};

const PACKAGE_TYPES = [
  "individual",
  "couple",
  "family",
  "group",
  "adventure",
  "safari",
  "beach_holiday",
  "cultural",
] as const;

export default function PackagesPage() {
  const [packages, setPackages] = useState<OperatorPackage[] | null>(null);
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [loggedIn, setLoggedIn] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    name: "",
    type: "safari" as (typeof PACKAGE_TYPES)[number],
    durationDays: 3,
    minGroupSize: 1,
    shortDescription: "",
    destinationId: "",
    adultPrice: 0,
    currency: "USD",
  });

  function loadPackages() {
    listMyPackages(getToken()!)
      .then(setPackages)
      .catch(() => setPackages([]));
  }

  useEffect(() => {
    if (!isLoggedIn()) {
      setLoggedIn(false);
      return;
    }
    loadPackages();
    listDestinations()
      .then(setDestinations)
      .catch(() => setDestinations([]));
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await createPackage(getToken()!, {
        name: form.name,
        type: form.type,
        durationDays: form.durationDays,
        minGroupSize: form.minGroupSize,
        shortDescription: form.shortDescription || undefined,
        destinationIds: [form.destinationId],
        prices: [{ travelerType: "adult", pricingType: "individual", amount: form.adultPrice, currency: form.currency }],
      });
      setShowForm(false);
      loadPackages();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create package.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!loggedIn) {
    return (
      <div className="text-ink/60">
        <Link href="/login" className="text-acacia underline">
          Sign in
        </Link>{" "}
        to manage packages.
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-gold-deep">Listings</p>
          <h1 className="mt-2 font-display text-3xl text-ink-horizon">Your packages</h1>
        </div>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="rounded-full bg-ink-horizon px-5 py-2.5 font-body text-sm font-semibold text-sand-light transition hover:bg-acacia"
        >
          {showForm ? "Cancel" : "New package"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="mt-6 space-y-4 rounded-xl border border-ink-horizon/10 bg-white p-6">
          <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-ink/40">
            Basic details - full itinerary, multi-season pricing, and inclusions/exclusions can be added by editing
            the package after it's created.
          </p>
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-ink/80">
              Package name
            </label>
            <input
              id="name"
              required
              minLength={3}
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-ink-horizon/20 bg-sand-light px-3 py-2 text-sm text-ink focus-visible:border-gold"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="type" className="block text-sm font-medium text-ink/80">
                Type
              </label>
              <select
                id="type"
                value={form.type}
                onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as typeof form.type }))}
                className="mt-1 w-full rounded-lg border border-ink-horizon/20 bg-sand-light px-3 py-2 text-sm text-ink focus-visible:border-gold"
              >
                {PACKAGE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="destinationId" className="block text-sm font-medium text-ink/80">
                Destination
              </label>
              <select
                id="destinationId"
                required
                value={form.destinationId}
                onChange={(e) => setForm((f) => ({ ...f, destinationId: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-ink-horizon/20 bg-sand-light px-3 py-2 text-sm text-ink focus-visible:border-gold"
              >
                <option value="" disabled>
                  Select a destination
                </option>
                {destinations.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label htmlFor="durationDays" className="block text-sm font-medium text-ink/80">
                Duration (days)
              </label>
              <input
                id="durationDays"
                type="number"
                min={1}
                value={form.durationDays}
                onChange={(e) => setForm((f) => ({ ...f, durationDays: Number(e.target.value) }))}
                className="mt-1 w-full rounded-lg border border-ink-horizon/20 bg-sand-light px-3 py-2 text-sm text-ink focus-visible:border-gold"
              />
            </div>
            <div>
              <label htmlFor="minGroupSize" className="block text-sm font-medium text-ink/80">
                Min group size
              </label>
              <input
                id="minGroupSize"
                type="number"
                min={1}
                value={form.minGroupSize}
                onChange={(e) => setForm((f) => ({ ...f, minGroupSize: Number(e.target.value) }))}
                className="mt-1 w-full rounded-lg border border-ink-horizon/20 bg-sand-light px-3 py-2 text-sm text-ink focus-visible:border-gold"
              />
            </div>
            <div>
              <label htmlFor="adultPrice" className="block text-sm font-medium text-ink/80">
                Adult price (USD)
              </label>
              <input
                id="adultPrice"
                type="number"
                min={0}
                step="0.01"
                required
                value={form.adultPrice}
                onChange={(e) => setForm((f) => ({ ...f, adultPrice: Number(e.target.value) }))}
                className="mt-1 w-full rounded-lg border border-ink-horizon/20 bg-sand-light px-3 py-2 text-sm text-ink focus-visible:border-gold"
              />
            </div>
          </div>
          <div>
            <label htmlFor="shortDescription" className="block text-sm font-medium text-ink/80">
              Short description
            </label>
            <textarea
              id="shortDescription"
              rows={2}
              value={form.shortDescription}
              onChange={(e) => setForm((f) => ({ ...f, shortDescription: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-ink-horizon/20 bg-sand-light px-3 py-2 text-sm text-ink focus-visible:border-gold"
            />
          </div>

          {error && <p className="rounded-lg bg-plum/10 px-3 py-2 text-sm text-plum">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="rounded-full bg-gold px-5 py-2.5 font-body text-sm font-semibold text-ink-horizon transition hover:bg-gold-soft disabled:opacity-50"
          >
            {submitting ? "Creating…" : "Create package"}
          </button>
        </form>
      )}

      {packages === null && <p className="mt-8 text-ink/50">Loading…</p>}

      {packages && packages.length === 0 && !showForm && (
        <div className="mt-8 rounded-xl border border-dashed border-ink-horizon/20 p-10 text-center text-ink/50">
          No packages yet - create your first one above.
        </div>
      )}

      {packages && packages.length > 0 && (
        <ul className="mt-8 space-y-3">
          {packages.map((p) => (
            <li key={p.id} className="flex items-center justify-between rounded-xl border border-ink-horizon/10 bg-white px-5 py-4">
              <div>
                <p className="font-display text-lg text-ink-horizon">{p.name}</p>
                <p className="font-mono text-xs text-ink/40">
                  {p.type.replace(/_/g, " ")} · {p.durationDays} days
                </p>
              </div>
              <span className={`rounded-full px-3 py-1 font-mono text-[10px] uppercase tracking-[0.1em] ${STATUS_STYLES[p.status] ?? "bg-ink-horizon/5 text-ink/60"}`}>
                {p.status.replace(/_/g, " ")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
