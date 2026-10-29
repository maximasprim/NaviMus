"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listVehicleTypes, listMyVehicles, addVehicle, type VehicleType, type OperatorVehicle } from "@/lib/api";
import { getToken, isLoggedIn } from "@/lib/session";
import { ApiError } from "@/lib/api-client";

export default function VehiclesPage() {
  const [types, setTypes] = useState<VehicleType[]>([]);
  const [vehicles, setVehicles] = useState<OperatorVehicle[] | null>(null);
  const [vehicleTypeId, setVehicleTypeId] = useState("");
  const [name, setName] = useState("");
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [capacity, setCapacity] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function load() {
    if (!isLoggedIn()) return;
    listVehicleTypes().then((t) => {
      setTypes(t);
      if (t.length > 0) setVehicleTypeId((prev) => prev || t[0].id);
    });
    listMyVehicles(getToken()!)
      .then(setVehicles)
      .catch(() => setVehicles([]));
  }
  useEffect(load, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await addVehicle(getToken()!, {
        vehicleTypeId,
        name: name || undefined,
        registrationNumber: registrationNumber || undefined,
        capacity: Number(capacity),
      });
      setName("");
      setRegistrationNumber("");
      setCapacity("");
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't add that vehicle.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!isLoggedIn()) {
    return (
      <div className="text-ink/60">
        <Link href="/login" className="text-acacia underline">
          Sign in
        </Link>{" "}
        to manage vehicles.
      </div>
    );
  }

  return (
    <div>
      <p className="font-mono text-xs uppercase tracking-[0.3em] text-gold-deep">Fleet</p>
      <h1 className="mt-2 font-display text-3xl text-ink-horizon">Vehicles</h1>

      <form onSubmit={handleAdd} className="mt-6 flex flex-wrap gap-2 rounded-xl border border-ink-horizon/10 bg-white p-5">
        <select value={vehicleTypeId} onChange={(e) => setVehicleTypeId(e.target.value)} className="rounded-lg border border-ink-horizon/20 px-3 py-2 text-sm">
          {types.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (optional)" className="flex-1 rounded-lg border border-ink-horizon/20 px-3 py-2 text-sm" />
        <input
          value={registrationNumber}
          onChange={(e) => setRegistrationNumber(e.target.value)}
          placeholder="Registration number"
          className="w-40 rounded-lg border border-ink-horizon/20 px-3 py-2 text-sm"
        />
        <input required type="number" value={capacity} onChange={(e) => setCapacity(e.target.value)} placeholder="Capacity" className="w-28 rounded-lg border border-ink-horizon/20 px-3 py-2 text-sm" />
        <button
          type="submit"
          disabled={submitting || !vehicleTypeId}
          className="rounded-full bg-ink-horizon px-5 py-2 text-sm font-medium text-sand-light hover:bg-acacia disabled:opacity-50"
        >
          Add vehicle
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-plum">{error}</p>}

      {vehicles === null && <p className="mt-8 text-ink/50">Loading…</p>}
      {vehicles && vehicles.length === 0 && <p className="mt-8 text-ink/50">No vehicles registered yet.</p>}

      <ul className="mt-6 divide-y divide-ink-horizon/10 text-sm">
        {vehicles?.map((v) => (
          <li key={v.id} className="flex items-center justify-between py-3">
            <span>{v.name || types.find((t) => t.id === v.vehicleTypeId)?.name || "Vehicle"}</span>
            <span className="text-ink/50">
              {v.registrationNumber ? `${v.registrationNumber} · ` : ""}
              {v.capacity} seats
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
