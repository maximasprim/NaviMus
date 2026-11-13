"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { getPaymentDetail, issueRefund, type PaymentDetail } from "@/lib/api";
import { getToken } from "@/lib/session";
import { Btn, Card, Field, KV, Modal, Notice, PageHeader, StatusBadge, errMsg, inputCls } from "@/components/detail-ui";
import { money } from "@/components/pager";

export default function PaymentDetailPage({ params }: { params: { id: string } }) {
  const [p, setP] = useState<PaymentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [refunding, setRefunding] = useState(false);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    getPaymentDetail(getToken()!, params.id).then(setP).catch((e) => setError(errMsg(e, "Could not load this payment.")));
  }, [params.id]);
  useEffect(load, [load]);

  async function refund(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await issueRefund(getToken()!, { paymentId: params.id, amount: amount ? Number(amount) : undefined, reason: reason.trim() || undefined });
      setRefunding(false);
      setAmount("");
      setReason("");
      setMessage("Refund requested.");
      load();
    } catch (err) {
      setError(errMsg(err, "The refund didn't go through."));
    } finally {
      setBusy(false);
    }
  }

  if (!p) return <div className="p-8">{error ? <Notice kind="error">{error}</Notice> : <p className="text-sm text-ink/50">Loading…</p>}</div>;
  const refundable = ["PAID", "PARTIALLY_REFUNDED"].includes(p.status.toUpperCase());

  return (
    <div className="space-y-6 p-8">
      <PageHeader
        eyebrow="Payment"
        title={money(p.originalAmount, p.originalCurrency)}
        badge={<StatusBadge value={p.status.toLowerCase()} />}
        back={<Link href="/payments" className="text-xs text-ink/50 hover:text-ink-horizon">← All payments</Link>}
        actions={refundable ? <Btn tone="dangerOutline" onClick={() => setRefunding(true)}>Refund</Btn> : undefined}
      />
      {error && <Notice kind="error">{error}</Notice>}
      {message && <Notice kind="ok">{message}</Notice>}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Payment">
          <dl>
            <KV label="Method"><span className="capitalize">{p.provider}</span></KV>
            <KV label="Receipt"><span className="font-mono text-xs">{p.providerReceipt ?? "-"}</span></KV>
            <KV label="Amount paid">{money(p.originalAmount, p.originalCurrency)}</KV>
            <KV label="In base currency">{money(p.baseCurrencyAmount, p.baseCurrency)}</KV>
            {p.exchangeRate && <KV label="Exchange rate">{p.exchangeRate}</KV>}
            <KV label="Created">{new Date(p.createdAt).toLocaleString()}</KV>
          </dl>
        </Card>
        <Card title="Booking">
          {p.booking ? (
            <dl>
              <KV label="Booking">
                <Link href={`/bookings/${p.booking.id}`} className="text-acacia hover:underline">Open booking</Link>
              </KV>
              <KV label="Status"><StatusBadge value={p.booking.status} /></KV>
              <KV label="Customer">
                <Link href={`/users/${p.booking.userId}`} className="text-acacia hover:underline">{p.booking.contactEmail}</Link>
              </KV>
              <KV label="Total">{money(p.booking.totalAmount, p.booking.currency)}</KV>
              <KV label="Paid so far">{money(p.booking.amountPaid, p.booking.currency)}</KV>
            </dl>
          ) : (
            <p className="text-sm text-ink/50">Booking not found.</p>
          )}
        </Card>
      </div>
      <Card title={`Transactions (${p.transactions.length})`}>
        {p.transactions.length === 0 ? (
          <p className="text-sm text-ink/50">None recorded.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {p.transactions.map((t) => (
              <li key={t.id} className="flex justify-between gap-4 border-b border-ink-horizon/5 pb-2">
                <span className="font-mono text-xs">{t.providerReference}</span>
                <span className="font-mono text-xs text-ink/40">{new Date(t.createdAt).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title={`Refunds (${p.refunds.length})`}>
        {p.refunds.length === 0 ? (
          <p className="text-sm text-ink/50">No refunds.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {p.refunds.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-horizon/5 pb-2">
                <span>{money(r.amount, r.currency)}{r.reason ? <span className="text-ink/50"> · {r.reason}</span> : null}</span>
                <span className="flex items-center gap-3">
                  <StatusBadge value={String(r.status).toLowerCase()} />
                  <span className="font-mono text-xs text-ink/40">{new Date(r.createdAt).toLocaleString()}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {refunding && (
        <Modal title="Refund this payment" onClose={() => setRefunding(false)}>
          <form onSubmit={refund} className="space-y-3">
            <Field label={`Amount (leave empty to refund all of ${money(p.originalAmount, p.originalCurrency)})`}>
              <input type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Reason">
              <input value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} className={inputCls} />
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <Btn type="button" onClick={() => setRefunding(false)}>Cancel</Btn>
              <Btn type="submit" tone="danger" disabled={busy}>{busy ? "Refunding…" : "Refund"}</Btn>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
