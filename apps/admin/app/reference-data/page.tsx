"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  listCountries,
  createCountry,
  listRegions,
  createRegion,
  listCities,
  createCity,
  listDestinationCategories,
  createDestinationCategory,
  listTransferLocations,
  createTransferLocation,
  type Country,
  type Region,
  type City,
  type DestinationCategory,
  type TransferLocation,
} from "@/lib/api";
import { getToken, isLoggedIn } from "@/lib/session";

type Tab = "countries" | "regions" | "cities" | "categories" | "locations";

export default function ReferenceDataPage() {
  const [tab, setTab] = useState<Tab>("countries");
  const [loggedIn, setLoggedIn] = useState(true);

  useEffect(() => {
    setLoggedIn(isLoggedIn());
  }, []);

  if (!loggedIn) {
    return (
      <div className="p-3 text-ink/60">
        <Link href="/login" className="text-acacia underline">
          Sign in
        </Link>{" "}
        to manage reference data.
      </div>
    );
  }

  return (
    <div className="p-3">
      <p className="font-mono text-xs uppercase tracking-[0.3em] text-gold-deep">Catalog</p>
      <h1 className="mt-2 font-display text-3xl text-ink-horizon">Reference data</h1>
      <p className="mt-2 text-sm text-ink/60">
        Countries, regions, cities, destination categories, and transfer locations (airports/hotels).
      </p>

      <div className="mt-6 flex gap-2 border-b border-ink-horizon/10">
        {(["countries", "regions", "cities", "categories", "locations"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`border-b-2 px-3 py-2 text-sm capitalize ${
              tab === t ? "border-acacia text-ink-horizon" : "border-transparent text-ink/50 hover:text-ink"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === "countries" && <CountriesTab />}
        {tab === "regions" && <RegionsTab />}
        {tab === "cities" && <CitiesTab />}
        {tab === "categories" && <CategoriesTab />}
        {tab === "locations" && <LocationsTab />}
      </div>
    </div>
  );
}

function CountriesTab() {
  const [items, setItems] = useState<Country[] | null>(null);
  const [isoCode, setIsoCode] = useState("");
  const [name, setName] = useState("");

  function load() {
    listCountries(getToken()!).then(setItems);
  }
  useEffect(load, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    await createCountry(getToken()!, { isoCode, name });
    setIsoCode("");
    setName("");
    load();
  }

  return (
    <div>
      <form onSubmit={handleAdd} className="flex gap-2">
        <input required maxLength={2} value={isoCode} onChange={(e) => setIsoCode(e.target.value.toUpperCase())} placeholder="ISO (KE)" className="w-24 rounded-lg border border-ink-horizon/20 px-3 py-2 text-sm" />
        <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Country name" className="flex-1 rounded-lg border border-ink-horizon/20 px-3 py-2 text-sm" />
        <button className="rounded-full bg-ink-horizon px-4 py-2 text-sm font-medium text-sand-light hover:bg-acacia">Add</button>
      </form>
      <ul className="mt-4 divide-y divide-ink-horizon/10 text-sm">
        {items?.map((c) => (
          <li key={c.id} className="flex justify-between py-2">
            <span>{c.name}</span>
            <span className="font-mono text-ink/40">{c.isoCode}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RegionsTab() {
  const [countries, setCountries] = useState<Country[]>([]);
  const [items, setItems] = useState<Region[] | null>(null);
  const [countryId, setCountryId] = useState("");
  const [name, setName] = useState("");

  useEffect(() => {
    listCountries(getToken()!).then(setCountries);
    listRegions(getToken()!).then(setItems);
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    await createRegion(getToken()!, { countryId, name });
    setName("");
    listRegions(getToken()!).then(setItems);
  }

  return (
    <div>
      <form onSubmit={handleAdd} className="flex gap-2">
        <select required value={countryId} onChange={(e) => setCountryId(e.target.value)} className="rounded-lg border border-ink-horizon/20 px-3 py-2 text-sm">
          <option value="">Country…</option>
          {countries.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Region name" className="flex-1 rounded-lg border border-ink-horizon/20 px-3 py-2 text-sm" />
        <button className="rounded-full bg-ink-horizon px-4 py-2 text-sm font-medium text-sand-light hover:bg-acacia">Add</button>
      </form>
      <ul className="mt-4 divide-y divide-ink-horizon/10 text-sm">
        {items?.map((r) => (
          <li key={r.id} className="py-2">
            {r.name}
          </li>
        ))}
      </ul>
    </div>
  );
}

function CitiesTab() {
  const [regions, setRegions] = useState<Region[]>([]);
  const [items, setItems] = useState<City[] | null>(null);
  const [regionId, setRegionId] = useState("");
  const [name, setName] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");

  useEffect(() => {
    listRegions(getToken()!).then(setRegions);
    listCities(getToken()!).then(setItems);
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    await createCity(getToken()!, {
      regionId,
      name,
      latitude: lat ? Number(lat) : undefined,
      longitude: lng ? Number(lng) : undefined,
    });
    setName("");
    setLat("");
    setLng("");
    listCities(getToken()!).then(setItems);
  }

  return (
    <div>
      <form onSubmit={handleAdd} className="flex flex-wrap gap-2">
        <select required value={regionId} onChange={(e) => setRegionId(e.target.value)} className="rounded-lg border border-ink-horizon/20 px-3 py-2 text-sm">
          <option value="">Region…</option>
          {regions.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="City name" className="flex-1 rounded-lg border border-ink-horizon/20 px-3 py-2 text-sm" />
        <input value={lat} onChange={(e) => setLat(e.target.value)} placeholder="Lat" className="w-24 rounded-lg border border-ink-horizon/20 px-3 py-2 text-sm" />
        <input value={lng} onChange={(e) => setLng(e.target.value)} placeholder="Lng" className="w-24 rounded-lg border border-ink-horizon/20 px-3 py-2 text-sm" />
        <button className="rounded-full bg-ink-horizon px-4 py-2 text-sm font-medium text-sand-light hover:bg-acacia">Add</button>
      </form>
      <ul className="mt-4 divide-y divide-ink-horizon/10 text-sm">
        {items?.map((c) => (
          <li key={c.id} className="py-2">
            {c.name}
          </li>
        ))}
      </ul>
    </div>
  );
}

function CategoriesTab() {
  const [items, setItems] = useState<DestinationCategory[] | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");

  function load() {
    listDestinationCategories(getToken()!).then(setItems);
  }
  useEffect(load, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    await createDestinationCategory(getToken()!, { name, slug });
    setName("");
    setSlug("");
    load();
  }

  return (
    <div>
      <form onSubmit={handleAdd} className="flex gap-2">
        <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Category name" className="flex-1 rounded-lg border border-ink-horizon/20 px-3 py-2 text-sm" />
        <input required value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="slug" className="w-40 rounded-lg border border-ink-horizon/20 px-3 py-2 text-sm" />
        <button className="rounded-full bg-ink-horizon px-4 py-2 text-sm font-medium text-sand-light hover:bg-acacia">Add</button>
      </form>
      <ul className="mt-4 divide-y divide-ink-horizon/10 text-sm">
        {items?.map((c) => (
          <li key={c.id} className="flex justify-between py-2">
            <span>{c.name}</span>
            <span className="font-mono text-ink/40">{c.slug}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function LocationsTab() {
  const [cities, setCities] = useState<City[]>([]);
  const [items, setItems] = useState<TransferLocation[] | null>(null);
  const [cityId, setCityId] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState("airport");

  useEffect(() => {
    listCities(getToken()!).then(setCities);
    listTransferLocations(getToken()!).then(setItems);
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    await createTransferLocation(getToken()!, { cityId, name, type });
    setName("");
    listTransferLocations(getToken()!).then(setItems);
  }

  return (
    <div>
      <form onSubmit={handleAdd} className="flex flex-wrap gap-2">
        <select required value={cityId} onChange={(e) => setCityId(e.target.value)} className="rounded-lg border border-ink-horizon/20 px-3 py-2 text-sm">
          <option value="">City…</option>
          {cities.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. JKIA" className="flex-1 rounded-lg border border-ink-horizon/20 px-3 py-2 text-sm" />
        <select value={type} onChange={(e) => setType(e.target.value)} className="rounded-lg border border-ink-horizon/20 px-3 py-2 text-sm">
          <option value="airport">Airport</option>
          <option value="hotel">Hotel</option>
          <option value="address">Address</option>
        </select>
        <button className="rounded-full bg-ink-horizon px-4 py-2 text-sm font-medium text-sand-light hover:bg-acacia">Add</button>
      </form>
      <ul className="mt-4 divide-y divide-ink-horizon/10 text-sm">
        {items?.map((l) => (
          <li key={l.id} className="flex justify-between py-2">
            <span>{l.name}</span>
            <span className="text-xs uppercase text-ink/40">{l.type}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
