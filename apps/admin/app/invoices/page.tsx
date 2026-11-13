"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listInvoicesAdmin, type InvoiceRow } from "@/lib/api";
import { getToken } from "@/lib/session";
import { Notice, errMsg, inputCls } from "@/components/detail-ui";
import { Pager, money } from "@/components/pager";

export default function InvoicesPage() {
  const [items, setItems] = useState<InvoiceRow[] | null>(null);
  const [meta, setMeta] = useState<any>(null);
  const [page, setPage] = useState(1);
  const [unpaid, setUnpaid] = useState(false);
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setItems(null);
    listInvoicesAdmin(getToken()!, { page, unpaidOnly: unpaid, search: search || undefined })
      .then((r) => {
        setItems(r.items);
        setMeta(r.meta);
        setError(null);
      })
      .catch((e) => {
        setItems([]);
        setError(errMsg(e, "Could not load invoices."));
      });
  }, [page, unpaid, search]);

  return (
    <div className="space-y-6 p-8">
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-gold-deep">Money</p>
        <h1 className="mt-2 font-display text-3xl text-ink-horizon">Invoices</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink/60">Invoices issued for bookings, with what has been paid and what is still owed.</p>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          setSearch(term.trim());
        }}
        className="flex flex-wrap items-center gap-4"
      >
        <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Invoice number or email" className={`${inputCls} !mt-0 w-64`} />
        <label className="flex items-center gap-2 text-sm text-ink-horizon">
          <input type="checkbox" checked={unpaid} onChange={(e) => { setPage(1); setUnpaid(e.target.checked); }} />
          Only invoices with a balance due
        </label>
      </form>
      {error && <Notice kind="error">{error}</Notice>}
      {items === null && <p className="text-sm text-ink/50">Loading…</p>}
      {items && items.length === 0 && !error && <p className="text-sm text-ink/50">No invoices match.</p>}
      {items && items.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-ink-horizon/10 bg-white">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-ink-horizon/10 text-xs uppercase tracking-wide text-ink/40">
                <th className="px-4 py-3 font-normal">Invoice</th>
                <th className="px-4 py-3 font-normal">Customer</th>
                <th className="px-4 py-3 font-normal">Total</th>
                <th className="px-4 py-3 font-normal">Paid</th>
                <th className="px-4 py-3 font-normal">Balance</th>
                <th className="px-4 py-3 font-normal">Issued</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id} className="border-b border-ink-horizon/5">
                  <td className="px-4 py-3 font-mono text-xs">{i.invoiceNumber}</td>
                  <td className="px-4 py-3 text-ink/60">{i.contactEmail ?? "-"}</td>
                  <td className="px-4 py-3">{money(i.totalAmount, i.currency)}</td>
                  <td className="px-4 py-3">{money(i.amountPaid, i.currency)}</td>
                  <td className={`px-4 py-3 ${Number(i.balanceDue) > 0 ? "text-plum" : "text-acacia"}`}>{money(i.balanceDue, i.currency)}</td>
                  <td className="px-4 py-3 font-mono text-xs text-ink/40">{new Date(i.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/bookings/${i.bookingId}`} className="text-acacia hover:underline">Booking</Link>
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
