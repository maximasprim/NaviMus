import type { ReactNode } from "react";
import Link from "next/link";
import type { Earning, EarningsPoint, Operator, OperatorBooking, OperatorPackage } from "@/lib/api";
import { LineChart } from "@/components/mini-chart";

/**
 * Presentation only. Session checks, the approval gate and data loading stay in app/page.tsx,
 * so every piece here can be rendered with plain props.
 */

const money = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });

/** Colour carries meaning: green = healthy, gold = waiting on payment, plum/brick = lost or failed. */
const STATUS_COLORS: Record<string, string> = {
  DRAFT: "#B4BDB8",
  PENDING_PAYMENT: "#C7A233",
  PAYMENT_PROCESSING: "#E4C766",
  CONFIRMED: "#3C6E5E",
  PARTIALLY_PAID: "#86AC9D",
  FULLY_PAID: "#2D5547",
  UPCOMING: "#6BA3C2",
  IN_PROGRESS: "#3E7CB1",
  COMPLETED: "#14231F",
  CANCEL_REQUESTED: "#C9824A",
  CANCELLED: "#5B4363",
  REFUND_PENDING: "#9A7BA5",
  REFUNDED: "#7A5F84",
  EXPIRED: "#CDD3CF",
  FAILED: "#A8472F",
};
const FALLBACK_COLOR = "#9AA6A0";
const colorOf = (status: string) => STATUS_COLORS[status] ?? FALLBACK_COLOR;

/** Statuses where the trip is booked and will go ahead. */
const CONFIRMED_STATUSES = new Set(["CONFIRMED", "PARTIALLY_PAID", "FULLY_PAID"]);
const AWAITING_PAYMENT = new Set(["PENDING_PAYMENT", "PAYMENT_PROCESSING"]);

function statusLabel(status: string): string {
  const t = status.replace(/_/g, " ").toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Local "YYYY-MM-DD", comparable as a string against ISO travel dates. */
function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Page frame shared by every dashboard state (loading, gate messages, loaded). */
export function DashboardShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-full bg-canvas">
      <div className="mx-auto max-w-[1200px] px-6 py-8 lg:px-10 lg:py-10">{children}</div>
    </div>
  );
}

function Panel({ title, action, children, className = "" }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-hairline bg-white p-6 ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-3">
          {title && <h2 className="text-sm font-semibold text-ink-horizon">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

function Stat({ label, value, hint, size = "md" }: { label: string; value: string; hint?: string; size?: "md" | "lg" }) {
  return (
    <div>
      <p className="text-sm text-fog">{label}</p>
      <p className={`mt-1.5 font-semibold tabular-nums tracking-tight text-ink-horizon ${size === "lg" ? "text-4xl" : "text-2xl"}`}>
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-fog">{hint}</p>}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-canvas px-2.5 py-1 text-xs font-medium text-ink-horizon">
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: colorOf(status) }} aria-hidden />
      {statusLabel(status)}
    </span>
  );
}

function Chevron() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden className="shrink-0 text-fog">
      <path d="m9 6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const MAX_LEGEND_ROWS = 5;

function StatusBreakdown({ bookings }: { bookings: OperatorBooking[] }) {
  const counts = new Map<string, number>();
  for (const b of bookings) counts.set(b.status, (counts.get(b.status) ?? 0) + 1);
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const total = bookings.length;

  if (total === 0) return <p className="mt-5 text-sm text-fog">No bookings yet.</p>;

  // Keep the legend a fixed, scannable length: top statuses, then everything else rolled into "Other".
  const rows: [string, number][] =
    sorted.length > MAX_LEGEND_ROWS
      ? [...sorted.slice(0, MAX_LEGEND_ROWS - 1), ["__other", sorted.slice(MAX_LEGEND_ROWS - 1).reduce((s, [, c]) => s + c, 0)]]
      : sorted;
  const labelOf = (s: string) => (s === "__other" ? "Other" : statusLabel(s));

  return (
    <div className="mt-5">
      <div className="flex h-2 gap-0.5 overflow-hidden rounded-full" role="img" aria-label="Bookings by status">
        {rows.map(([status, count]) => (
          <span key={status} title={`${labelOf(status)}: ${count}`} style={{ width: `${(count / total) * 100}%`, backgroundColor: colorOf(status) }} />
        ))}
      </div>
      <ul className="mt-4 space-y-2">
        {rows.map(([status, count]) => (
          <li key={status} className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 text-ink/80">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: colorOf(status) }} aria-hidden />
              {labelOf(status)}
            </span>
            <span className="font-medium tabular-nums text-ink-horizon">{count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`rounded-xl bg-hairline/60 motion-safe:animate-pulse ${className}`} aria-hidden />;
}

export function DashboardSkeleton() {
  return (
    <DashboardShell>
      <div role="status" aria-live="polite">
        <span className="sr-only">Loading dashboard…</span>
        <Skeleton className="h-4 w-24" />
        <Skeleton className="mt-3 h-8 w-64" />
        <div className="mt-6 grid gap-4 xl:grid-cols-3" aria-hidden>
          <Skeleton className="h-80 rounded-2xl xl:col-span-2" />
          <Skeleton className="h-80 rounded-2xl" />
        </div>
        <div className="mt-4 grid gap-4 xl:grid-cols-5" aria-hidden>
          <Skeleton className="h-72 rounded-2xl xl:col-span-3" />
          <Skeleton className="h-72 rounded-2xl xl:col-span-2" />
        </div>
      </div>
    </DashboardShell>
  );
}

/* ---------- gate states: same conditions and wording as before, just restyled ---------- */

export function LoggedOutNotice() {
  return (
    <DashboardShell>
      <div className="mx-auto max-w-md rounded-2xl border border-hairline bg-white p-8 text-center">
        <h1 className="text-lg font-semibold text-ink-horizon">Welcome to NaviMus Partners</h1>
        <p className="mt-2 text-fog">
          <Link href="/login" className="font-medium text-acacia underline underline-offset-2">
            Sign in
          </Link>{" "}
          or{" "}
          <Link href="/register" className="font-medium text-acacia underline underline-offset-2">
            register your business
          </Link>{" "}
          to get started.
        </p>
      </div>
    </DashboardShell>
  );
}

export function NotRegisteredNotice() {
  return (
    <DashboardShell>
      <div className="mx-auto max-w-md rounded-2xl border border-dashed border-ink-horizon/20 bg-white p-10 text-center">
        <p className="text-ink/70">You haven&apos;t registered a business yet.</p>
        <Link
          href="/register"
          className="mt-5 inline-block rounded-lg bg-gold px-5 py-2.5 text-sm font-semibold text-ink-horizon transition hover:bg-gold-soft"
        >
          Register your business
        </Link>
      </div>
    </DashboardShell>
  );
}

export function NotApprovedNotice({ message }: { message: string | null }) {
  return (
    <DashboardShell>
      <div className="mx-auto max-w-md rounded-2xl border border-gold/40 bg-gold/10 p-8 text-center">
        <p className="text-sm font-semibold text-gold-deep">Application status</p>
        <p className="mt-3 text-ink/80">{message}</p>
      </div>
    </DashboardShell>
  );
}

/* ---------- the dashboard ---------- */

export function PartnerDashboard({
  operator,
  earnings,
  series,
  bookings,
  packages,
}: {
  operator: Operator | null;
  /** null while loading; the page falls back to [] if a request fails. */
  earnings: Earning[] | null;
  series: EarningsPoint[] | null;
  bookings: OperatorBooking[] | null;
  packages: OperatorPackage[] | null;
}) {
  const today = todayIso();
  const primary = earnings && earnings.length > 0 ? earnings[0] : null;
  const otherCurrencies = earnings ? earnings.slice(1) : [];

  const upcoming = bookings ? bookings.filter((b) => CONFIRMED_STATUSES.has(b.status) && b.travelDate >= today).length : 0;
  const awaiting = bookings ? bookings.filter((b) => AWAITING_PAYMENT.has(b.status)).length : 0;
  const recent = bookings ? [...bookings].sort((a, b) => b.travelDate.localeCompare(a.travelDate)).slice(0, 5) : null;

  return (
    <DashboardShell>
      <p className="text-sm text-fog">Welcome back</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink-horizon">{operator?.businessName}</h1>

      <div className="mt-6 grid gap-4 xl:grid-cols-3">
        <Panel className="xl:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-x-10 gap-y-5">
            {earnings === null ? (
              <Skeleton className="h-16 w-48" />
            ) : primary ? (
              <Stat label={`Earnings (${primary.currency})`} value={money(primary.amount)} size="lg" />
            ) : (
              <Stat label="Earnings" value="0" size="lg" />
            )}
            {otherCurrencies.length > 0 && (
              <dl className="flex gap-10 pt-1 text-sm">
                {otherCurrencies.map((e) => (
                  <div key={e.currency}>
                    <dt className="text-fog">{e.currency}</dt>
                    <dd className="mt-1.5 text-lg font-semibold tabular-nums text-ink-horizon">{money(e.amount)}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
          <p className="mt-3 text-xs text-fog">Your share after the platform commission, from confirmed bookings.</p>
          {series ? (
            <div className="mt-5">
              <LineChart
                points={series.map((s) => ({ label: s.date, value: s.amount }))}
                emptyMessage="No earnings recorded in this range yet."
                formatValue={money}
                height={250}
              />
            </div>
          ) : (
            <Skeleton className="mt-6 h-48" />
          )}
        </Panel>

        <Panel className="flex flex-col">
          {bookings === null ? (
            <Skeleton className="h-40" />
          ) : (
            <>
              <Stat label="Total bookings" value={String(bookings.length)} size="lg" />
              <StatusBreakdown bookings={bookings} />
              <div className="mt-auto pt-6">
                <div className="grid grid-cols-2 gap-4 border-t border-hairline pt-5">
                  <Stat label="Upcoming trips" value={String(upcoming)} />
                  <Stat label="Awaiting payment" value={String(awaiting)} />
                </div>
              </div>
            </>
          )}
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-5">
        <Panel
          title="Recent bookings"
          className="xl:col-span-3"
          action={
            <Link href="/bookings" className="text-sm font-medium text-acacia hover:underline">
              View all
            </Link>
          }
        >
          {recent === null ? (
            <Skeleton className="mt-4 h-48" />
          ) : recent.length === 0 ? (
            <p className="mt-4 text-sm text-fog">No bookings yet for your packages.</p>
          ) : (
            <ul className="mt-2 divide-y divide-hairline">
              {recent.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-4 py-3.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink-horizon">{b.travelDate}</p>
                    <p className="mt-0.5 text-xs text-fog">
                      #{b.id.slice(0, 8).toUpperCase()} · {b.travelerCount} traveler{b.travelerCount === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-sm tabular-nums text-ink/80">
                      {b.currency} {Number(b.totalAmount).toLocaleString()}
                    </span>
                    <StatusBadge status={b.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Shortcuts" className="xl:col-span-2">
          <ul className="mt-2 divide-y divide-hairline">
            {[
              { href: "/packages", title: "Packages", text: "Manage your listings and availability", hint: packages ? `${packages.length} listed` : undefined },
              { href: "/bookings", title: "Bookings", text: "See who's booked your trips", hint: bookings ? `${bookings.length} total` : undefined },
              { href: "/earnings", title: "Earnings", text: "Track what you're owed", hint: undefined },
            ].map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="group flex items-center justify-between gap-4 py-3.5">
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-ink-horizon group-hover:text-acacia">{item.title}</span>
                    <span className="mt-0.5 block text-xs text-fog">{item.text}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2 text-xs tabular-nums text-fog">
                    {item.hint}
                    <Chevron />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </DashboardShell>
  );
}
