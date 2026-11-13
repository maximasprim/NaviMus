"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listPaymentsAdmin, type PaymentRow } from "@/lib/api";
import { getToken } from "@/lib/session";
import { Notice, StatusBadge, errMsg, inputCls } from "@/components/detail-ui";
import { Pager, money } from "@/components/pager";

export default function PaymentsPage() {
  const [items, setItems] = useState<PaymentRow[] | null>(null);
  const [meta, setMeta] = useState<any>(null);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [provider, setProvider] = useState("");
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setItems(null);
    listPaymentsAdmin(getToken()!, { page, status: status || undefined, provider: provider || undefined, search: search || undefined })
      .then((r) => {
        setItems(r.items);
        setMeta(r.meta);
        setError(null);
      })
      .catch((e) => {
        setItems([]);
        setError(errMsg(e, "Could not load payments."));
      });
  }, [page, status, provider, search]);

  return (
    <div className="space-y-6 p-8">
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-gold-deep">Money</p>
        <h1 className="mt-2 font-display text-3xl text-ink-horizon">Payments</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink/60">Every payment attempt across bookings. Open one to see its transactions and refunds.</p>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          setSearch(term.trim());
        }}
        className="flex flex-wrap items-end gap-3"
      >
        <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Receipt or booking id" className={`${inputCls} !mt-0 w-64`} />
        <select value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }} className={`${inputCls} !mt-0 w-44`}>
          <option value="">Any status</option>
          {["INITIATED", "PENDING", "AUTHORIZED", "PAID", "FAILED", "CANCELLED", "REFUND_PENDING", "REFUNDED", "PARTIALLY_REFUNDED"].map((s) => (
            <option key={s} value={s}>{s.toLowerCase().replace(/_/g, " ")}</option>
          ))}
        </select>
        <select value={provider} onChange={(e) => { setPage(1); setProvider(e.target.value); }} className={`${inputCls} !mt-0 w-40`}>
          <option value="">Any method</option>
          <option value="mpesa">M-Pesa</option>
          <option value="stripe">Card (Stripe)</option>
          <option value="mock">Test</option>
        </select>
      </form>
      {error && <Notice kind="error">{error}</Notice>}
      {items === null && <p className="text-sm text-ink/50">Loading…</p>}
      {items && items.length === 0 && !error && <p className="text-sm text-ink/50">No payments match.</p>}
      {items && items.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-ink-horizon/10 bg-white">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-ink-horizon/10 text-xs uppercase tracking-wide text-ink/40">
                <th className="px-4 py-3 font-normal">Date</th>
                <th className="px-4 py-3 font-normal">Method</th>
                <th className="px-4 py-3 font-normal">Amount</th>
                <th className="px-4 py-3 font-normal">Status</th>
                <th className="px-4 py-3 font-normal">Receipt</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id} className="border-b border-ink-horizon/5">
                  <td className="px-4 py-3 font-mono text-xs text-ink/50">{new Date(p.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-3 capitalize">{p.provider}</td>
                  <td className="px-4 py-3">{money(p.originalAmount, p.originalCurrency)}</td>
                  <td className="px-4 py-3"><StatusBadge value={p.status.toLowerCase()} /></td>
                  <td className="px-4 py-3 font-mono text-xs">{p.providerReceipt ?? "-"}</td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/payments/${p.id}`} className="text-acacia hover:underline">Open</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager page={page} meta={meta} onPage={setPage} />
    </div>
  );
}
