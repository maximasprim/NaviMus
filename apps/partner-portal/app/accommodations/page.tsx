"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  listMyAccommodations,
  createAccommodation,
  addRoomType,
  listCities,
  type OperatorAccommodation,
  type CityOption,
} from "@/lib/api";
import { getToken, isLoggedIn } from "@/lib/session";
import { ApiError } from "@/lib/api-client";

const TYPES = ["hotel", "lodge", "resort", "villa", "apartment", "cottage", "camp", "guest_house", "eco_lodge", "glamping"];

export default function AccommodationsPage() {
  const [items, setItems] = useState<OperatorAccommodation[] | null>(null);
  const [cities, setCities] = useState<CityOption[]>([]);
  const [cityId, setCityId] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState(TYPES[0]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [roomDraft, setRoomDraft] = useState<Record<string, { name: string; maxOccupancy: string; price: string; currency: string }>>({});

  function load() {
    if (!isLoggedIn()) return;
    listMyAccommodations(getToken()!)
      .then(setItems)
      .catch(() => setItems([]));
    listCities().then(setCities);
  }
  useEffect(load, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await createAccommodation(getToken()!, { cityId, name, type });
      setName("");
      setCityId("");
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't create that listing.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAddRoomType(accommodationId: string) {
    const draft = roomDraft[accommodationId];
    if (!draft?.name || !draft.price) return;
    await addRoomType(getToken()!, accommodationId, {
      name: draft.name,
      maxOccupancy: Number(draft.maxOccupancy) || 2,
      basePricePerNight: Number(draft.price),
      currency: draft.currency || "USD",
    });
    setRoomDraft((prev) => ({ ...prev, [accommodationId]: { name: "", maxOccupancy: "2", price: "", currency: "USD" } }));
  }

  if (!isLoggedIn()) {
    return (
      <div className="text-ink/60">
        <Link href="/login" className="text-acacia underline">
          Sign in
        </Link>{" "}
        to manage accommodation listings.
      </div>
    );
  }

  return (
    <div>
      <p className="font-mono text-xs uppercase tracking-[0.3em] text-gold-deep">Listings</p>
      <h1 className="mt-2 font-display text-3xl text-ink-horizon">Accommodation</h1>

      <form onSubmit={handleCreate} className="mt-6 flex flex-wrap gap-2 rounded-xl border border-ink-horizon/10 bg-white p-5">
        <select
          required
          value={cityId}
          onChange={(e) => setCityId(e.target.value)}
          className="min-w-[240px] rounded-lg border border-ink-horizon/20 px-3 py-2 text-sm"
        >
          <option value="">Select a city…</option>
          {cities.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}, {c.regionName}, {c.countryName}
            </option>
          ))}
        </select>
        <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Property name" className="flex-1 rounded-lg border border-ink-horizon/20 px-3 py-2 text-sm" />
        <select value={type} onChange={(e) => setType(e.target.value)} className="rounded-lg border border-ink-horizon/20 px-3 py-2 text-sm">
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {t.replace(/_/g, " ")}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-full bg-ink-horizon px-5 py-2 text-sm font-medium text-sand-light hover:bg-acacia disabled:opacity-50"
        >
          Create
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-plum">{error}</p>}

      {items === null && <p className="mt-8 text-ink/50">Loading…</p>}
      {items && items.length === 0 && <p className="mt-8 text-ink/50">No accommodation listings yet.</p>}

      <ul className="mt-6 space-y-4">
        {items?.map((a) => {
          const draft = roomDraft[a.id] ?? { name: "", maxOccupancy: "2", price: "", currency: "USD" };
          return (
            <li key={a.id} className="rounded-xl border border-ink-horizon/10 bg-white p-5">
              <div className="flex items-center justify-between">
                <p className="font-display text-lg text-ink-horizon">{a.name}</p>
                <span className="rounded-full bg-ink-horizon/5 px-2.5 py-0.5 text-xs capitalize text-ink/60">{a.status}</span>
              </div>
              <p className="text-xs uppercase tracking-wide text-ink/40">{a.type.replace(/_/g, " ")}</p>

              <div className="mt-3 flex flex-wrap gap-2 border-t border-ink-horizon/10 pt-3">
                <input
                  placeholder="Room type name"
                  value={draft.name}
                  onChange={(e) => setRoomDraft((prev) => ({ ...prev, [a.id]: { ...draft, name: e.target.value } }))}
                  className="flex-1 rounded-lg border border-ink-horizon/20 px-2 py-1.5 text-xs"
                />
                <input
                  placeholder="Max occupancy"
                  type="number"
                  value={draft.maxOccupancy}
                  onChange={(e) => setRoomDraft((prev) => ({ ...prev, [a.id]: { ...draft, maxOccupancy: e.target.value } }))}
                  className="w-28 rounded-lg border border-ink-horizon/20 px-2 py-1.5 text-xs"
                />
                <input
                  placeholder="Price/night"
                  type="number"
                  value={draft.price}
                  onChange={(e) => setRoomDraft((prev) => ({ ...prev, [a.id]: { ...draft, price: e.target.value } }))}
                  className="w-28 rounded-lg border border-ink-horizon/20 px-2 py-1.5 text-xs"
                />
                <button
                  onClick={() => handleAddRoomType(a.id)}
                  className="rounded-full bg-ink-horizon/10 px-3 py-1.5 text-xs font-medium text-ink-horizon hover:bg-ink-horizon/20"
                >
                  + Add room type
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
