"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listCancellationPolicies, createCancellationPolicy, type CancellationPolicy } from "@/lib/api";
import { getToken, isLoggedIn } from "@/lib/session";

interface RuleDraft {
  daysBeforeMin: string;
  daysBeforeMax: string;
  refundPercentage: string;
  penaltyPercentage: string;
}

const EMPTY_RULE: RuleDraft = { daysBeforeMin: "", daysBeforeMax: "", refundPercentage: "", penaltyPercentage: "" };

export default function CancellationPoliciesPage() {
  const [policies, setPolicies] = useState<CancellationPolicy[] | null>(null);
  const [loggedIn, setLoggedIn] = useState(true);
  const [name, setName] = useState("");
  const [operatorId, setOperatorId] = useState("");
  const [rules, setRules] = useState<RuleDraft[]>([{ ...EMPTY_RULE }]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function load() {
    if (!isLoggedIn()) {
      setLoggedIn(false);
      return;
    }
    listCancellationPolicies(getToken()!)
      .then(setPolicies)
      .catch(() => setPolicies([]));
  }

  useEffect(load, []);

  function updateRule(i: number, key: keyof RuleDraft, value: string) {
    setRules((prev) => prev.map((r, idx) => (idx === i ? { ...r, [key]: value } : r)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const policy = await createCancellationPolicy(getToken()!, {
        name,
        operatorId,
        rules: rules.map((r) => ({
          daysBeforeMin: Number(r.daysBeforeMin),
          daysBeforeMax: r.daysBeforeMax ? Number(r.daysBeforeMax) : undefined,
          refundPercentage: Number(r.refundPercentage),
          penaltyPercentage: Number(r.penaltyPercentage),
        })),
      });
      setPolicies((prev) => [...(prev ?? []), policy]);
      setName("");
      setOperatorId("");
      setRules([{ ...EMPTY_RULE }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create that policy.");
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
        to manage cancellation policies.
      </div>
    );
  }

  return (
    <div className="p-3">
      <p className="font-mono text-xs uppercase tracking-[0.3em] text-gold-deep">Finance</p>
      <h1 className="mt-2 font-display text-3xl text-ink-horizon">Cancellation policies</h1>
      <p className="mt-2 text-sm text-ink/60">
        Configurable refund/penalty bands, applied by days-before-trip.
      </p>

      {policies === null && <p className="mt-8 text-ink/50">Loading…</p>}

      <ul className="mt-6 space-y-4">
        {policies?.map((p) => (
          <li key={p.id} className="rounded-xl border border-ink-horizon/10 bg-white p-5">
            <p className="font-display text-lg text-ink-horizon">{p.name}</p>
            <p className="text-xs text-ink/40">Operator {p.operatorId}</p>
            <table className="mt-3 w-full text-left text-xs">
              <thead>
                <tr className="text-ink/40">
                  <th className="pb-1 pr-4">Days before trip</th>
                  <th className="pb-1 pr-4">Refund %</th>
                  <th className="pb-1">Penalty %</th>
                </tr>
              </thead>
              <tbody>
                {p.rules.map((r) => (
                  <tr key={r.id}>
                    <td className="pr-4 py-1">
                      {r.daysBeforeMin}–{r.daysBeforeMax ?? "∞"}
                    </td>
                    <td className="pr-4 py-1">{r.refundPercentage}%</td>
                    <td className="py-1">{r.penaltyPercentage}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </li>
        ))}
      </ul>

      <form onSubmit={handleSubmit} className="mt-10 rounded-xl border border-ink-horizon/10 bg-white p-6">
        <h2 className="font-display text-lg text-ink-horizon">New policy</h2>
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Policy name"
          className="mt-3 w-full rounded-lg border border-ink-horizon/20 px-3 py-2 text-sm"
        />
        <input
          required
          value={operatorId}
          onChange={(e) => setOperatorId(e.target.value)}
          placeholder="Operator ID - every policy belongs to one operator; there's no platform-wide default yet"
          className="mt-2 w-full rounded-lg border border-ink-horizon/20 px-3 py-2 text-sm"
        />
        <div className="mt-4 space-y-2">
          {rules.map((r, i) => (
            <div key={i} className="grid grid-cols-4 gap-2">
              <input
                required
                type="number"
                placeholder="Min days"
                value={r.daysBeforeMin}
                onChange={(e) => updateRule(i, "daysBeforeMin", e.target.value)}
                className="rounded-lg border border-ink-horizon/20 px-2 py-1.5 text-sm"
              />
              <input
                type="number"
                placeholder="Max days (blank = ∞)"
                value={r.daysBeforeMax}
                onChange={(e) => updateRule(i, "daysBeforeMax", e.target.value)}
                className="rounded-lg border border-ink-horizon/20 px-2 py-1.5 text-sm"
              />
              <input
                required
                type="number"
                placeholder="Refund %"
                value={r.refundPercentage}
                onChange={(e) => updateRule(i, "refundPercentage", e.target.value)}
                className="rounded-lg border border-ink-horizon/20 px-2 py-1.5 text-sm"
              />
              <input
                required
                type="number"
                placeholder="Penalty %"
                value={r.penaltyPercentage}
                onChange={(e) => updateRule(i, "penaltyPercentage", e.target.value)}
                className="rounded-lg border border-ink-horizon/20 px-2 py-1.5 text-sm"
              />
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setRules((prev) => [...prev, { ...EMPTY_RULE }])}
          className="mt-2 text-xs text-acacia underline"
        >
          + Add band
        </button>
        {error && <p className="mt-3 text-sm text-plum">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="mt-4 rounded-full bg-ink-horizon px-5 py-2 text-sm font-medium text-sand-light hover:bg-acacia disabled:opacity-50"
        >
          {submitting ? "Saving…" : "Create policy"}
        </button>
      </form>
    </div>
  );
}
