"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { getOperatorOverview, getUserOverview, listAllSupportTickets, listTenantBillingEvents, type AdminSupportTicket, type OperatorOverview, type UserOverview } from "@/lib/api";
import { getToken } from "@/lib/session";
import { Card, StatusBadge } from "@/components/detail-ui";
import { money } from "@/components/pager";

function Table({ head, children, empty }: { head: string[]; children: ReactNode[]; empty: string }) {
  if (children.length === 0) return <p className="text-sm text-ink/50">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-ink-horizon/10 text-xs uppercase tracking-wide text-ink/40">
            {head.map((h) => (
              <th key={h} className="pb-2 pr-4 font-normal">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
const TD = "py-2 pr-4";

/** Everything a customer has done: bookings, payments and saved travelers. */
export function UserRelated({ userId }: { userId: string }) {
  const [data, setData] = useState<UserOverview | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    getUserOverview(getToken()!, userId).then(setData).catch(() => setFailed(true));
  }, [userId]);
  if (failed) return null;
  if (!data) return <p className="text-sm text-ink/50">Loading activity…</p>;
  return (
    <>
      <Card title={`Bookings (${data.bookings.length})`}>
        <Table head={["Package", "Travel date", "Total", "Paid", "Status", ""]} empty="No bookings.">
          {data.bookings.map((b) => (
            <tr key={b.id} className="border-b border-ink-horizon/5">
              <td className={TD}>{b.packageName ?? "-"}</td>
              <td className={`${TD} font-mono text-xs`}>{b.travelDate}</td>
              <td className={TD}>{money(b.totalAmount, b.currency)}</td>
              <td className={TD}>{money(b.amountPaid, b.currency)}</td>
              <td className={TD}><StatusBadge value={b.status} /></td>
              <td className={TD}><Link href={`/bookings/${b.id}`} className="text-acacia hover:underline">Open</Link></td>
            </tr>
          ))}
        </Table>
      </Card>
      <Card title={`Payments (${data.payments.length})`}>
        <Table head={["Date", "Method", "Amount", "Status", ""]} empty="No payments.">
          {data.payments.map((p) => (
            <tr key={p.id} className="border-b border-ink-horizon/5">
              <td className={`${TD} font-mono text-xs`}>{new Date(p.createdAt).toLocaleDateString()}</td>
              <td className={`${TD} capitalize`}>{p.provider}</td>
              <td className={TD}>{money(p.originalAmount, p.originalCurrency)}</td>
              <td className={TD}><StatusBadge value={p.status.toLowerCase()} /></td>
              <td className={TD}><Link href={`/payments/${p.id}`} className="text-acacia hover:underline">Open</Link></td>
            </tr>
          ))}
        </Table>
      </Card>
      <Card title={`Saved travelers (${data.travelers.length})`}>
        <Table head={["Name", "Nationality", "Date of birth", "Passport", "Notes"]} empty="No saved travelers.">
          {data.travelers.map((t) => (
            <tr key={t.id} className="border-b border-ink-horizon/5">
              <td className={TD}>{t.firstName} {t.lastName}</td>
              <td className={TD}>{t.nationality ?? "-"}</td>
              <td className={`${TD} font-mono text-xs`}>{t.dateOfBirth ?? "-"}</td>
              <td className={TD}>{t.hasPassport ? `On file${t.passportExpiryDate ? ` (expires ${t.passportExpiryDate})` : ""}` : "-"}</td>
              <td className={`${TD} text-xs text-ink/60`}>{t.dietaryRequirements ?? ""}</td>
            </tr>
          ))}
        </Table>
        <p className="mt-3 text-xs text-ink/40">Passport numbers are never shown here. {data.reviewCount} review{data.reviewCount === 1 ? "" : "s"} written.</p>
      </Card>
    </>
  );
}

/** An operator's packages, accommodation, transport providers and latest bookings. */
export function OperatorRelated({ operatorId }: { operatorId: string }) {
  const [data, setData] = useState<OperatorOverview | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    getOperatorOverview(getToken()!, operatorId).then(setData).catch(() => setFailed(true));
  }, [operatorId]);
  if (failed) return null;
  if (!data) return <p className="text-sm text-ink/50">Loading listings…</p>;
  return (
    <>
      <Card title={`Packages (${data.packages.length})`}>
        <Table head={["Name", "Days", "Bookings", "Status", ""]} empty="No packages.">
          {data.packages.map((p) => (
            <tr key={p.id} className="border-b border-ink-horizon/5">
              <td className={TD}>{p.name}{p.featured ? <span className="ml-2 text-xs text-gold-deep">featured</span> : null}</td>
              <td className={TD}>{p.durationDays}</td>
              <td className={TD}>{p.bookings}</td>
              <td className={TD}><StatusBadge value={p.status} /></td>
              <td className={TD}><Link href={`/listings/package/${p.id}`} className="text-acacia hover:underline">Open</Link></td>
            </tr>
          ))}
        </Table>
      </Card>
      <Card title={`Accommodation (${data.accommodations.length})`}>
        <Table head={["Name", "Type", "Status", ""]} empty="No accommodation.">
          {data.accommodations.map((a) => (
            <tr key={a.id} className="border-b border-ink-horizon/5">
              <td className={TD}>{a.name}</td>
              <td className={`${TD} capitalize`}>{a.type}</td>
              <td className={TD}><StatusBadge value={a.status} /></td>
              <td className={TD}><Link href={`/listings/accommodation/${a.id}`} className="text-acacia hover:underline">Open</Link></td>
            </tr>
          ))}
        </Table>
      </Card>
      <Card title={`Transport providers (${data.transportProviders.length})`}>
        <Table head={["Name", "Phone", ""]} empty="No transport providers.">
          {data.transportProviders.map((t) => (
            <tr key={t.id} className="border-b border-ink-horizon/5">
              <td className={TD}>{t.name}</td>
              <td className={TD}>{t.contactPhone ?? "-"}</td>
              <td className={TD}><Link href={`/listings/transport/${t.id}`} className="text-acacia hover:underline">Open</Link></td>
            </tr>
          ))}
        </Table>
      </Card>
      <Card title="Recent bookings">
        <Table head={["Package", "Travel date", "Total", "Status", ""]} empty="No bookings yet.">
          {data.recentBookings.map((b) => (
            <tr key={b.id} className="border-b border-ink-horizon/5">
              <td className={TD}>{b.packageName ?? "-"}</td>
              <td className={`${TD} font-mono text-xs`}>{b.travelDate}</td>
              <td className={TD}>{money(b.totalAmount, b.currency)}</td>
              <td className={TD}><StatusBadge value={b.status} /></td>
              <td className={TD}><Link href={`/bookings/${b.id}`} className="text-acacia hover:underline">Open</Link></td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}

/** Subscription and billing activity of one tenant (platform admin only; the API refuses anyone else). */
export function TenantBilling({ tenantId }: { tenantId: string }) {
  const [rows, setRows] = useState<{ id: string; type: string; outcome: string | null; createdAt: string }[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    listTenantBillingEvents(getToken()!, tenantId).then(setRows).catch(() => setFailed(true));
  }, [tenantId]);
  if (failed) return null;
  return (
    <Card title="Billing activity">
      {rows === null ? (
        <p className="text-sm text-ink/50">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-ink/50">No billing events yet.</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-horizon/5 pb-2">
              <span className="text-ink-horizon">{r.type.replace(/[._]/g, " ")}</span>
              <span className="flex items-center gap-3">
                {r.outcome && <StatusBadge value={r.outcome} />}
                <span className="font-mono text-xs text-ink/40">{new Date(r.createdAt).toLocaleString()}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** A customer's support tickets (needs the support permission; hidden for anyone without it). */
export function UserTickets({ userId }: { userId: string }) {
  const [rows, setRows] = useState<AdminSupportTicket[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    listAllSupportTickets(getToken()!, undefined, userId).then(setRows).catch(() => setFailed(true));
  }, [userId]);
  if (failed) return null;
  return (
    <Card title={`Support tickets${rows ? ` (${rows.length})` : ""}`}>
      {rows === null ? (
        <p className="text-sm text-ink/50">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-ink/50">No support tickets.</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {rows.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-horizon/5 pb-2">
              <Link href={`/support/${t.id}`} className="text-acacia hover:underline">
                {t.subject}
              </Link>
              <span className="flex items-center gap-3">
                <StatusBadge value={t.status} />
                <span className="font-mono text-xs text-ink/40">{new Date(t.createdAt).toLocaleDateString()}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
