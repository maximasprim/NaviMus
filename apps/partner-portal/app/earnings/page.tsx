"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getMyEarnings, getMyEarningsTimeSeries, type Earning, type EarningsPoint } from "@/lib/api";
import { getToken, isLoggedIn } from "@/lib/session";
import { LineChart } from "@/components/mini-chart";

export default function EarningsPage() {
  const [earnings, setEarnings] = useState<Earning[] | null>(null);
  const [series, setSeries] = useState<EarningsPoint[] | null>(null);
  const [loggedIn, setLoggedIn] = useState(true);

  useEffect(() => {
    if (!isLoggedIn()) {
      setLoggedIn(false);
      return;
    }
    getMyEarnings(getToken()!)
      .then(setEarnings)
      .catch(() => setEarnings([]));
    getMyEarningsTimeSeries(getToken()!)
      .then(setSeries)
      .catch(() => setSeries([]));
  }, []);

  if (!loggedIn) {
    return (
      <div className="text-ink/60">
        <Link href="/login" className="text-acacia underline">
          Sign in
        </Link>{" "}
        to see earnings.
      </div>
    );
  }

  return (
    <div>
      <p className="font-mono text-xs uppercase tracking-[0.3em] text-gold-deep">Payouts</p>
      <h1 className="mt-2 font-display text-3xl text-ink-horizon">Earnings</h1>
      <p className="mt-2 text-sm text-ink/60">
        Your share of customer payments after the platform commission, computed from confirmed bookings.
      </p>

      {earnings === null && <p className="mt-8 text-ink/50">Loading…</p>}

      {earnings && earnings.length === 0 && (
        <div className="mt-8 rounded-xl border border-dashed border-ink-horizon/20 p-10 text-center text-ink/50">
          No earnings recorded yet.
        </div>
      )}

      {earnings && earnings.length > 0 && (
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {earnings.map((e) => (
            <div key={e.currency} className="rounded-xl border border-ink-horizon/10 bg-white p-6">
              <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-ink/40">{e.currency}</p>
              <p className="mt-2 font-display text-3xl text-acacia">{e.amount.toLocaleString()}</p>
            </div>
          ))}
        </div>
      )}

      {series && series.length > 0 && (
        <div className="mt-8 rounded-xl border border-ink-horizon/10 bg-white p-5">
          <h2 className="font-display text-lg text-ink-horizon">Earnings over time</h2>
          <div className="mt-3">
            <LineChart points={series.map((s) => ({ label: s.date, value: s.amount }))} />
          </div>
        </div>
      )}
    </div>
  );
}
