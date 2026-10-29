"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listSettings, updateSetting, type SystemSetting } from "@/lib/api";
import { getToken, isLoggedIn } from "@/lib/session";
import { CustomDomainSection } from "@/components/custom-domain-section";
import { UsageBillingSection } from "@/components/usage-billing-section";

// Suggested keys per spec section 44 (currency, platform fees, payment
// provider config) - this is a generic key/value settings store
// (system_settings table), not a dedicated form per concern, so any
// key works; these are just a starting point shown as quick-add chips.
const SUGGESTED_KEYS = [
  "platform_commission_percentage",
  "default_currency",
  "supported_currencies",
  "mpesa_enabled",
  "stripe_enabled",
  "booking_hold_duration_minutes",
];

export default function SettingsPage() {
  const [settings, setSettings] = useState<SystemSetting[] | null>(null);
  const [loggedIn, setLoggedIn] = useState(true);
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function load() {
    if (!isLoggedIn()) {
      setLoggedIn(false);
      return;
    }
    listSettings(getToken()!)
      .then(setSettings)
      .catch(() => setSettings([]));
  }

  useEffect(load, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      // Values are stored as JSON - try to parse as JSON first (numbers,
      // booleans, arrays), fall back to a plain string if that fails.
      let parsedValue: unknown = value;
      try {
        parsedValue = JSON.parse(value);
      } catch {
        // plain string is fine
      }
      const setting = await updateSetting(getToken()!, key, parsedValue, description || undefined);
      setSettings((prev) => {
        const others = (prev ?? []).filter((s) => s.key !== setting.key);
        return [...others, setting];
      });
      setKey("");
      setValue("");
      setDescription("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save that setting.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!loggedIn) {
    return (
      <div className="p-3 text-ink/60">
        <Link href="/login" className="text-acacia underline">
          Sign in
        </Link>{" "}
        to manage settings.
      </div>
    );
  }

  return (
    <div className="p-3">
      <p className="font-mono text-xs uppercase tracking-[0.3em] text-gold-deep">Platform</p>
      <h1 className="mt-2 font-display text-3xl text-ink-horizon">Settings</h1>
      <p className="mt-2 text-sm text-ink/60">
        Currency, platform fees, and payment/notification provider toggles.
      </p>

      <div className="mt-6 max-w-xl space-y-6">
        <UsageBillingSection />
        <CustomDomainSection />
      </div>

      {settings === null && <p className="mt-8 text-ink/50">Loading…</p>}

      <ul className="mt-6 divide-y divide-ink-horizon/10">
        {settings?.map((s) => (
          <li key={s.key} className="flex items-center justify-between py-3">
            <div>
              <p className="font-mono text-sm text-ink-horizon">{s.key}</p>
              {s.description && <p className="text-xs text-ink/40">{s.description}</p>}
            </div>
            <span className="font-mono text-sm text-ink/70">{JSON.stringify(s.value)}</span>
          </li>
        ))}
        {settings && settings.length === 0 && <p className="py-4 text-sm text-ink/50">No settings configured yet.</p>}
      </ul>

      <form onSubmit={handleSubmit} className="mt-10 rounded-xl border border-ink-horizon/10 bg-white p-6">
        <h2 className="font-display text-lg text-ink-horizon">Set a value</h2>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {SUGGESTED_KEYS.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKey(k)}
              className="rounded-full bg-ink-horizon/5 px-2.5 py-1 font-mono text-xs text-ink/60 hover:bg-ink-horizon/10"
            >
              {k}
            </button>
          ))}
        </div>
        <input
          required
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="Key"
          className="mt-3 w-full rounded-lg border border-ink-horizon/20 px-3 py-2 text-sm"
        />
        <input
          required
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder='Value (e.g. 10, "USD", true, ["KES","USD"])'
          className="mt-2 w-full rounded-lg border border-ink-horizon/20 px-3 py-2 text-sm"
        />
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optional)"
          className="mt-2 w-full rounded-lg border border-ink-horizon/20 px-3 py-2 text-sm"
        />
        {error && <p className="mt-3 text-sm text-plum">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="mt-4 rounded-full bg-ink-horizon px-5 py-2 text-sm font-medium text-sand-light hover:bg-acacia disabled:opacity-50"
        >
          {submitting ? "Saving…" : "Save"}
        </button>
      </form>
    </div>
  );
}
