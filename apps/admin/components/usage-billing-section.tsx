"use client";

import { useCallback, useEffect, useState } from "react";
import { getBilling, openBillingPortal, startCheckout, type BillingOverview } from "@/lib/api";
import { getToken } from "@/lib/session";

function UsageBar({ label, used, limit, atLimit }: { label: string; used: number; limit: number | null; atLimit: boolean }) {
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-xs text-ink/60">
        <span>{label}</span>
        <span className={atLimit ? "font-medium text-plum" : ""}>
          {used} {limit !== null ? `/ ${limit}` : "(unlimited)"}
        </span>
      </div>
      {limit !== null && (
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-ink-horizon/10">
          <div className={`h-full rounded-full ${atLimit ? "bg-plum" : "bg-acacia"}`} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}

const fmtLimit = (n: number | null, unit: string) => (n === null ? `Unlimited ${unit}` : `${n} ${unit}`);

/**
 * Plan, usage and self-serve billing. Card details and plan changes happen on
 * Stripe's hosted pages; this component only ever redirects there. The plan on
 * screen changes when Stripe's webhook reaches the server - NOT when the
 * browser comes back from Checkout - so after a successful return we poll
 * briefly for the webhook to land.
 */
export function UsageBillingSection() {
  const [billing, setBilling] = useState<BillingOverview | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [returning, setReturning] = useState<"success" | "cancelled" | null>(null);

  const load = useCallback(async () => {
    try {
      const b = await getBilling(getToken()!);
      setBilling(b);
      return b;
    } catch {
      setBilling(null);
      return null;
    }
  }, []);

  useEffect(() => {
    const flag = new URLSearchParams(window.location.search).get("checkout");
    if (flag === "success" || flag === "cancelled") setReturning(flag);
    void load();
  }, [load]);

  // After a successful Checkout, wait (up to ~30s) for Stripe's webhook to activate the plan.
  useEffect(() => {
    if (returning !== "success") return;
    let tries = 0;
    const timer = setInterval(async () => {
      tries++;
      const b = await load();
      if (b?.subscription.status || tries >= 15) clearInterval(timer);
    }, 2000);
    return () => clearInterval(timer);
  }, [returning, load]);

  const redirectTo = async (key: string, getUrl: () => Promise<string>) => {
    setBusy(key);
    setError(null);
    try {
      window.location.href = await getUrl();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setBusy(null);
    }
  };

  if (!billing) return null;
  const { subscription: sub, plan, usage, atLimit } = billing;
  const waitingForWebhook = returning === "success" && !sub.status;

  return (
    <div className="rounded-xl border border-ink-horizon/10 bg-white p-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg text-ink-horizon">Usage & billing</h2>
        <span className="rounded-full bg-gold/10 px-3 py-1 text-xs font-medium text-gold-deep">
          {plan.planName ?? "No plan assigned (unlimited)"}
        </span>
      </div>

      {waitingForWebhook && (
        <p className="mt-3 rounded-lg bg-acacia/10 px-3 py-2 text-sm text-ink">
          Thanks - waiting for Stripe to confirm your payment. Your plan updates automatically in a few seconds.
        </p>
      )}
      {returning === "cancelled" && <p className="mt-3 rounded-lg bg-ink-horizon/5 px-3 py-2 text-sm text-ink/70">Checkout cancelled - you have not been charged.</p>}
      {sub.paymentProblem && (
        <p className="mt-3 rounded-lg bg-plum/10 px-3 py-2 text-sm text-plum">
          Your last payment failed. Stripe will retry, but please update your card to avoid losing your plan.
        </p>
      )}
      {sub.cancelAtPeriodEnd && sub.currentPeriodEnd && (
        <p className="mt-3 rounded-lg bg-gold/10 px-3 py-2 text-sm text-gold-deep">
          Your subscription ends on {new Date(sub.currentPeriodEnd).toLocaleDateString()} and you will move to the free plan.
        </p>
      )}
      {sub.status === "canceled" && <p className="mt-3 text-sm text-ink/60">Your subscription has ended; you are on the free plan.</p>}

      <p className="mt-2 text-sm text-ink/60">Limits reset at the start of each calendar month.</p>
      <div className="mt-4 space-y-4">
        <UsageBar label="Bookings this month" used={usage.bookingsThisMonth} limit={plan.maxBookingsPerMonth} atLimit={atLimit.bookingsThisMonth} />
        <UsageBar label="Active operators" used={usage.activeOperators} limit={plan.maxOperators} atLimit={atLimit.activeOperators} />
        <UsageBar label="Staff users" used={usage.staffUsers} limit={plan.maxStaffUsers} atLimit={atLimit.staffUsers} />
      </div>

      {billing.billingEnabled ? (
        <>
          {sub.canManage && (
            <div className="mt-5">
              <button
                onClick={() => redirectTo("portal", () => openBillingPortal(getToken()!))}
                disabled={busy !== null}
                className="rounded-lg border border-ink-horizon/20 px-4 py-2 text-sm font-medium text-ink-horizon hover:bg-ink-horizon/5 disabled:opacity-50"
              >
                {busy === "portal" ? "Opening…" : "Manage subscription & invoices"}
              </button>
            </div>
          )}

          {!sub.status || sub.status === "canceled" ? (
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {billing.availablePlans
                .filter((p) => p.purchasable)
                .map((p) => (
                  <div key={p.code} className="rounded-lg border border-ink-horizon/10 p-4">
                    <div className="flex items-baseline justify-between">
                      <span className="font-medium text-ink-horizon">{p.name}</span>
                      <span className="text-sm text-ink">${Number(p.monthlyPriceUsd).toFixed(0)}/mo</span>
                    </div>
                    <ul className="mt-2 space-y-0.5 text-xs text-ink/60">
                      <li>{fmtLimit(p.maxBookingsPerMonth, "bookings / month")}</li>
                      <li>{fmtLimit(p.maxOperators, "operators")}</li>
                      <li>{fmtLimit(p.maxStaffUsers, "staff users")}</li>
                    </ul>
                    <button
                      onClick={() => redirectTo(p.code, () => startCheckout(getToken()!, p.code))}
                      disabled={busy !== null}
                      className="mt-3 w-full rounded-lg bg-ink-horizon px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                    >
                      {busy === p.code ? "Redirecting to Stripe…" : `Upgrade to ${p.name}`}
                    </button>
                  </div>
                ))}
            </div>
          ) : (
            <p className="mt-4 text-sm text-ink/60">To change plan or cancel, use “Manage subscription” above.</p>
          )}
        </>
      ) : (
        <p className="mt-4 text-sm text-ink/60">Self-serve billing is not enabled on this platform. Contact the platform team to change plans.</p>
      )}
      {error && <p className="mt-3 text-sm text-plum">{error}</p>}
    </div>
  );
}
