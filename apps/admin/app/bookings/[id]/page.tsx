"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getAdminBooking, adminCancelBooking, issueRefund, listPaymentsForBooking } from "@/lib/api";
import { getToken } from "@/lib/session";

export default function AdminBookingDetailPage({ params }: { params: { id: string } }) {
  const [booking, setBooking] = useState<Awaited<ReturnType<typeof getAdminBooking>> | null>(null);
  const [payments, setPayments] = useState<Awaited<ReturnType<typeof listPaymentsForBooking>>>([]);
  const [selectedPaymentId, setSelectedPaymentId] = useState("");
  const [reason, setReason] = useState("");
  const [refundAmount, setRefundAmount] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function reload() {
    getAdminBooking(getToken()!, params.id).then(setBooking);
    listPaymentsForBooking(getToken()!, params.id).then((p) => {
      setPayments(p);
      if (p.length > 0 && !selectedPaymentId) setSelectedPaymentId(p[0].id);
    });
  }

  useEffect(reload, [params.id]);

  async function handleCancel() {
    setBusy(true);
    setMessage(null);
    try {
      const result = await adminCancelBooking(getToken()!, params.id, reason || undefined);
      setMessage(`Cancelled. Computed refund: ${result.refundAmount}, penalty: ${result.penaltyAmount}.`);
      reload();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Cancellation failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRefund() {
    if (!selectedPaymentId) {
      setMessage("No payment found for this booking to refund.");
      return;
    }
    const amount = refundAmount ? Number(refundAmount) : undefined;
    setBusy(true);
    setMessage(null);
    try {
      await issueRefund(getToken()!, { paymentId: selectedPaymentId, amount, reason: reason || undefined });
      setMessage("Refund initiated.");
      reload();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Refund failed.");
    } finally {
      setBusy(false);
    }
  }

  if (!booking) return <div className="p-3 text-ink/50">Loading…</div>;

  return (
    <div className="p-3">
      <Link href="/bookings" className="text-sm text-acacia underline">
        ← All bookings
      </Link>
      <h1 className="mt-4 font-mono text-2xl text-ink-horizon">{booking.id.slice(0, 8).toUpperCase()}</h1>
      <p className="mt-1 text-sm text-ink/50">Status: {booking.status.replace(/_/g, " ")}</p>

      <div className="mt-6 grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-xs uppercase tracking-wide text-ink/40">Travel date</p>
          <p className="mt-1">{booking.travelDate}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-ink/40">Total</p>
          <p className="mt-1">
            {booking.currency} {Number(booking.totalAmount).toLocaleString()}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-ink/40">Contact</p>
          <p className="mt-1">{booking.contactEmail}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-ink/40">Travelers</p>
          <p className="mt-1">{booking.travelerCount}</p>
        </div>
      </div>

      {booking.statusHistory.length > 0 && (
        <div className="mt-8">
          <h2 className="font-display text-lg text-ink-horizon">Timeline</h2>
          <ul className="mt-2 space-y-1 border-l-2 border-ink-horizon/10 pl-4 text-sm">
            {[...booking.statusHistory].reverse().map((h: any) => (
              <li key={h.id}>
                <span className="font-mono text-ink/40">{new Date(h.createdAt).toLocaleString()}</span>{" "}
                <span className="text-ink/70">→ {h.toStatus.replace(/_/g, " ")}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-8 rounded-xl border border-ink-horizon/10 bg-white p-6">
        <h2 className="font-display text-lg text-ink-horizon">Actions</h2>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason (used for cancel or refund)"
          className="mt-3 w-full rounded-lg border border-ink-horizon/20 px-3 py-2 text-sm"
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            onClick={handleCancel}
            disabled={busy || booking.status === "CANCELLED"}
            className="rounded-full border border-plum/30 px-4 py-2 text-sm font-medium text-plum hover:bg-plum/10 disabled:opacity-50"
          >
            Cancel booking
          </button>
          {payments.length > 0 && (
            <select
              value={selectedPaymentId}
              onChange={(e) => setSelectedPaymentId(e.target.value)}
              className="rounded-lg border border-ink-horizon/20 px-3 py-2 text-sm"
            >
              {payments.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.id.slice(0, 8).toUpperCase()} · {p.currency} {p.amount} · {p.status}
                </option>
              ))}
            </select>
          )}
          <input
            value={refundAmount}
            onChange={(e) => setRefundAmount(e.target.value)}
            placeholder="Amount (blank = full refund)"
            type="number"
            className="w-48 rounded-lg border border-ink-horizon/20 px-3 py-2 text-sm"
          />
          <button
            onClick={handleRefund}
            disabled={busy || payments.length === 0}
            className="rounded-full bg-ink-horizon px-4 py-2 text-sm font-medium text-sand-light hover:bg-acacia disabled:opacity-50"
          >
            Issue refund
          </button>
        </div>
        {payments.length === 0 && <p className="mt-2 text-xs text-ink/40">No payments recorded for this booking yet.</p>}
        {message && <p className="mt-3 text-sm text-ink/70">{message}</p>}
      </div>
    </div>
  );
}
