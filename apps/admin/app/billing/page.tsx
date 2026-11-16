"use client";

import { useEffect, useState } from "react";
import { getBilling, type BillingOverview } from "@/lib/api";
import { getToken } from "@/lib/session";
import { UsageBillingSection } from "@/components/usage-billing-section";

const lim = (n: number | null, unit: string) => (n === null ? `Unlimited ${unit}` : `${n} ${unit}`);

/** The tenant's own billing: current plan and usage, upgrade or manage the subscription, and compare every plan. */
export default function BillingPage() {
  const [billing, setBilling] = useState<BillingOverview | null>(null);
  useEffect(() => {
    getBilling(getToken()!).then(setBilling).catch(() => setBilling(null));
  }, []);

  return (
    <div className="space-y-6 p-8">
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-gold-deep">Account</p>
        <h1 className="mt-2 font-display text-3xl text-ink-horizon">Billing</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink/60">Your plan, what you have used this month, and how to change plan or update your card.</p>
      </div>

      <UsageBillingSection />

      {billing && billing.availablePlans.length > 0 && (
        <div className="rounded-xl border border-ink-horizon/10 bg-white p-6">
          <h2 className="font-display text-lg text-ink-horizon">Compare plans</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-ink-horizon/10 text-xs uppercase tracking-wide text-ink/40">
                  <th className="pb-2 pr-4 font-normal">Plan</th>
                  <th className="pb-2 pr-4 font-normal">Price</th>
                  <th className="pb-2 pr-4 font-normal">Bookings / month</th>
                  <th className="pb-2 pr-4 font-normal">Operators</th>
                  <th className="pb-2 font-normal">Staff users</th>
                </tr>
              </thead>
              <tbody>
                {billing.availablePlans.map((p) => (
                  <tr key={p.code} className={`border-b border-ink-horizon/5 ${p.isCurrent ? "bg-gold/5" : ""}`}>
                    <td className="py-2 pr-4 text-ink-horizon">
                      {p.name}
                      {p.isCurrent && <span className="ml-2 rounded-full bg-gold/20 px-2 py-0.5 text-xs text-gold-deep">Your plan</span>}
                    </td>
                    <td className="py-2 pr-4">{Number(p.monthlyPriceUsd) === 0 ? "Free" : `$${Number(p.monthlyPriceUsd).toFixed(0)}/mo`}</td>
                    <td className="py-2 pr-4">{lim(p.maxBookingsPerMonth, "")}</td>
                    <td className="py-2 pr-4">{lim(p.maxOperators, "")}</td>
                    <td className="py-2">{lim(p.maxStaffUsers, "")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-ink/40">To switch plan, use the Upgrade buttons above, or Manage subscription if you already subscribe. Limits reset each calendar month.</p>
        </div>
      )}
    </div>
  );
}
