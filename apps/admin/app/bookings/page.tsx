"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listAllBookings, type AdminBooking } from "@/lib/api";
import { getToken, isLoggedIn } from "@/lib/session";

const STATUS_OPTIONS = [
  "",
  "PENDING_PAYMENT",
  "CONFIRMED",
  "PARTIALLY_PAID",
  "FULLY_PAID",
  "COMPLETED",
  "CANCELLED",
  "REFUND_PENDING",
  "REFUNDED",
  "EXPIRED",
];

export default function AdminBookingsPage() {
  const [bookings, setBookings] = useState<AdminBooking[] | null>(null);
  const [status, setStatus] = useState("");
  const [loggedIn, setLoggedIn] = useState(true);

  useEffect(() => {
    if (!isLoggedIn()) {
      setLoggedIn(false);
      return;
    }
    listAllBookings(getToken()!, 1, 50, status || undefined)
      .then(({ items }) => setBookings(items))
      .catch(() => setBookings([]));
  }, [status]);

  if (!loggedIn) {
    return (
      <div className="p-3 text-ink/60">
        <Link href="/login" className="text-acacia underline">
          Sign in
        </Link>{" "}
        to manage bookings.
      </div>
    );
  }

  return (
    <div className="p-3">
      <p className="font-mono text-xs uppercase tracking-[0.3em] text-gold-deep">Operations</p>
      <h1 className="mt-2 font-display text-3xl text-ink-horizon">Bookings</h1>

      <select
        value={status}
        onChange={(e) => setStatus(e.target.value)}
        className="mt-4 rounded-lg border border-ink-horizon/20 bg-white px-3 py-2 text-sm"
      >
        <option value="">All statuses</option>
        {STATUS_OPTIONS.filter(Boolean).map((s) => (
          <option key={s} value={s}>
            {s.replace(/_/g, " ")}
          </option>
        ))}
      </select>

      {bookings === null && <p className="mt-8 text-ink/50">Loading…</p>}
      {bookings && bookings.length === 0 && <p className="mt-8 text-ink/50">No bookings match this filter.</p>}

      {bookings && bookings.length > 0 && (
        <table className="mt-6 w-full text-left text-sm">
          <thead>
            <tr className="border-b border-ink-horizon/10 text-xs uppercase tracking-wide text-ink/40">
              <th className="pb-2">Reference</th>
              <th className="pb-2">Status</th>
              <th className="pb-2">Travel date</th>
              <th className="pb-2">Total</th>
              <th className="pb-2">Contact</th>
            </tr>
          </thead>
          <tbody>
            {bookings.map((b) => (
              <tr key={b.id} className="border-b border-ink-horizon/5">
                <td className="py-3">
                  <Link href={`/bookings/${b.id}`} className="font-mono text-acacia underline">
                    {b.id.slice(0, 8).toUpperCase()}
                  </Link>
                </td>
                <td className="py-3">{b.status.replace(/_/g, " ")}</td>
                <td className="py-3">{b.travelDate}</td>
                <td className="py-3">
                  {b.currency} {Number(b.totalAmount).toLocaleString()}
                </td>
                <td className="py-3 text-ink/60">{b.contactEmail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
