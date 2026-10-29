import type { ReactNode } from "react";
import Link from "next/link";
import type { DashboardMetrics, DashboardTimeSeries } from "@/lib/api";
import { LineChart, BarChart } from "@/components/mini-chart";

/**
 * Presentation only. Data loading, session checks and error handling stay in app/page.tsx,
 * so this can be rendered with plain props (and was, to check the layout with mock data).
 */

const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });

/** Colour carries meaning: green = healthy/progressing, gold = waiting on someone, plum/brick = lost money or failure. */
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

function statusLabel(status: string): string {
  const t = status.replace(/_/g, " ").toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Page frame shared by every state (loading, error, signed-out, loaded). */
export function DashboardShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-full bg-canvas">
      <div className="mx-auto max-w-8xl px-3 py-4 lg:px-3 lg:py-4">{children}</div>
    </div>
  );
}

function Panel({ title, children, className = "" }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-hairline bg-white p-6 ${className}`}>
      {title && <h2 className="text-sm font-semibold text-ink-horizon">{title}</h2>}
      {children}
    </section>
  );
}

function Stat({ label, value, hint, size = "md" }: { label: string; value: string; hint?: string; size?: "md" | "lg" }) {
  return (
    <div>
      <p className="text-sm text-fog">{label}</p>
      <p
        className={`mt-1.5 font-semibold tabular-nums tracking-tight text-ink-horizon ${
          size === "lg" ? "text-4xl" : "text-2xl"
        }`}
      >
        {value}
      </p>
      {hint && <p className="mt-1 text-xs font-medium text-gold-deep">{hint}</p>}
    </div>
  );
}

const MAX_LEGEND_ROWS = 6;

function StatusBreakdown({ byStatus }: { byStatus: Record<string, number> }) {
  const sorted = Object.entries(byStatus)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1]);
  const total = sorted.reduce((sum, [, count]) => sum + count, 0);

  if (total === 0) return <p className="mt-5 text-sm text-fog">No bookings yet.</p>;

  // Keep the legend a fixed, scannable length: top statuses, then everything else rolled into "Other".
  const rows: [string, number][] =
    sorted.length > MAX_LEGEND_ROWS
      ? [
          ...sorted.slice(0, MAX_LEGEND_ROWS - 1),
          ["__other", sorted.slice(MAX_LEGEND_ROWS - 1).reduce((sum, [, count]) => sum + count, 0)],
        ]
      : sorted;
  const colorOf = (status: string) => STATUS_COLORS[status] ?? FALLBACK_COLOR;
  const labelOf = (status: string) => (status === "__other" ? "Other" : statusLabel(status));

  return (
    <div className="mt-5">
      <div className="flex h-2 gap-0.5 overflow-hidden rounded-full" role="img" aria-label="Bookings by status">
        {rows.map(([status, count]) => (
          <span
            key={status}
            title={`${labelOf(status)}: ${count}`}
            style={{ width: `${(count / total) * 100}%`, backgroundColor: colorOf(status) }}
          />
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

function ChevronRight() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="m9 6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChartSkeleton() {
  return <div className="mt-6 h-48 rounded-xl bg-hairline/60 motion-safe:animate-pulse" aria-hidden />;
}

export function DashboardSkeleton() {
  const block = "rounded-2xl bg-hairline/60 motion-safe:animate-pulse";
  return (
    <DashboardShell>
      <div role="status" aria-live="polite">
        <span className="sr-only">Loading dashboard…</span>
        <div className="h-8 w-40 rounded-lg bg-hairline/60 motion-safe:animate-pulse" aria-hidden />
        <div className="mt-6 grid gap-4 xl:grid-cols-3" aria-hidden>
          <div className={`${block} h-80 xl:col-span-2`} />
          <div className={`${block} h-80`} />
        </div>
        <div className={`${block} mt-4 h-24`} aria-hidden />
        <div className="mt-4 grid gap-4 xl:grid-cols-5" aria-hidden>
          <div className={`${block} h-72 xl:col-span-3`} />
          <div className={`${block} h-72 xl:col-span-2`} />
        </div>
      </div>
    </DashboardShell>
  );
}

export function DashboardView({
  metrics,
  series,
}: {
  metrics: DashboardMetrics;
  /** null while the time series is still loading. */
  series: DashboardTimeSeries | null;
}) {
  const pending = metrics.pendingOperators;
  const topDestination = Math.max(1, ...metrics.popularDestinations.map((d) => d.bookingCount));

  return (
    <DashboardShell>
      <h1 className="text-2xl font-semibold tracking-tight text-ink-horizon">Dashboard</h1>

      {pending > 0 && (
        <Link
          href="/operators"
          className="mt-5 flex items-center justify-between gap-4 rounded-xl border border-gold/40 bg-gold/10 px-4 py-3 text-sm font-medium text-ink-horizon transition hover:bg-gold/20"
        >
          <span className="flex items-center gap-3">
            <span className="h-2 w-2 rounded-full bg-gold" aria-hidden />
            Review {pending} pending operator{pending === 1 ? "" : "s"}
          </span>
          <ChevronRight />
        </Link>
      )}

      <div className="mt-6 grid gap-4 xl:grid-cols-3">
        <Panel className="xl:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-x-10 gap-y-5">
            <Stat label="Gross revenue" value={fmt(metrics.revenue.grossRevenue)} size="lg" />
            <dl className="flex gap-10 pt-1 text-sm">
              <div>
                <dt className="text-fog">Refunds</dt>
                <dd className="mt-1.5 text-lg font-semibold tabular-nums text-ink-horizon">
                  {fmt(metrics.revenue.totalRefunds)}
                </dd>
              </div>
              <div>
                <dt className="text-fog">Platform fees</dt>
                <dd className="mt-1.5 text-lg font-semibold tabular-nums text-ink-horizon">
                  {fmt(metrics.revenue.platformFees)}
                </dd>
              </div>
            </dl>
          </div>
          {series ? (
            <div className="mt-6">
              <LineChart
                points={series.revenue.map((r) => ({ label: r.date, value: r.amount }))}
                emptyMessage="No revenue recorded in this range yet."
                formatValue={fmt}
                height={270}
              />
            </div>
          ) : (
            <ChartSkeleton />
          )}
        </Panel>

        <Panel className="flex flex-col">
          <Stat label="Total bookings" value={fmt(metrics.bookings.total)} size="lg" />
          <StatusBreakdown byStatus={metrics.bookings.byStatus} />
          <div className="mt-auto pt-6">
            <div className="grid grid-cols-2 gap-4 border-t border-hairline pt-5">
              <Stat label="Upcoming trips" value={fmt(metrics.upcomingTrips)} />
              <Stat label="Cancellation rate" value={`${metrics.cancellationRatePercent}%`} />
            </div>
          </div>
        </Panel>
      </div>

      <section aria-labelledby="platform-totals" className="mt-4">
        <h2 id="platform-totals" className="sr-only">
          Platform totals
        </h2>
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-hairline bg-hairline xl:grid-cols-5">
          <div className="bg-white p-5">
            <Stat label="New customers" value={fmt(metrics.customers.newInRange)} />
          </div>
          <div className="bg-white p-5">
            <Stat label="Active destinations" value={fmt(metrics.activeDestinations)} />
          </div>
          <div className="bg-white p-5">
            <Stat label="Active packages" value={fmt(metrics.activePackages)} />
          </div>
          <div className="bg-white p-5">
            <Stat label="Active operators" value={fmt(metrics.activeOperators)} />
          </div>
          <div className="col-span-2 bg-white p-5 xl:col-span-1">
            <Stat label="Pending operators" value={fmt(pending)} hint={pending > 0 ? "Needs review" : undefined} />
          </div>
        </div>
      </section>

      <div className="mt-4 grid gap-4 xl:grid-cols-5">
        <Panel title="Bookings over time" className="xl:col-span-3">
          <div className="mt-4">
            {series ? (
              <BarChart
                points={series.bookings.map((b) => ({ label: b.date, value: b.count }))}
                emptyMessage="No bookings in this range yet."
                formatValue={fmt}
              />
            ) : (
              <ChartSkeleton />
            )}
          </div>
        </Panel>

        <Panel title="Popular destinations" className="xl:col-span-2">
          {metrics.popularDestinations.length === 0 ? (
            <p className="mt-4 text-sm text-fog">Destinations will rank here once they get bookings.</p>
          ) : (
            <ol className="mt-4 space-y-4">
              {metrics.popularDestinations.map((d, i) => (
                <li key={d.destinationId}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="flex min-w-0 items-baseline gap-3">
                      <span className="w-4 shrink-0 text-xs tabular-nums text-fog">{i + 1}</span>
                      <span className="truncate font-medium text-ink-horizon">{d.destinationName}</span>
                    </span>
                    <span className="shrink-0 tabular-nums text-fog">
                      {d.bookingCount} booking{d.bookingCount === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="ml-7 mt-2 h-1.5 rounded-full bg-hairline" aria-hidden>
                    <div
                      className="h-full rounded-full bg-acacia"
                      style={{ width: `${(d.bookingCount / topDestination) * 100}%` }}
                    />
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </div>
    </DashboardShell>
  );
}
