"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listMyBookings, type OperatorBooking } from "@/lib/api";
import { getToken, isLoggedIn } from "@/lib/session";

const STATUS_STYLES: Record<string, string> = {
  CONFIRMED: "bg-acacia/10 text-acacia",
  PENDING_PAYMENT: "bg-gold/10 text-gold-deep",
  PAYMENT_PROCESSING: "bg-gold/10 text-gold-deep",
  CANCELLED: "bg-plum/10 text-plum",
  EXPIRED: "bg-plum/10 text-plum",
  FAILED: "bg-plum/10 text-plum",
};

export default function BookingsPage() {
  const [bookings, setBookings] = useState<OperatorBooking[] | null>(null);
  const [loggedIn, setLoggedIn] = useState(true);

  useEffect(() => {
    if (!isLoggedIn()) {
      setLoggedIn(false);
      return;
    }
    listMyBookings(getToken()!)
      .then(setBookings)
      .catch(() => setBookings([]));
  }, []);

  if (!loggedIn) {
    return (
      <div className="text-ink/60">
        <Link href="/login" className="text-acacia underline">
          Sign in
        </Link>{" "}
        to see bookings.
      </div>
    );
  }

  return (
    <div>
      <p className="font-mono text-xs uppercase tracking-[0.3em] text-gold-deep">Reservations</p>
      <h1 className="mt-2 font-display text-3xl text-ink-horizon">Bookings</h1>

      {bookings === null && <p className="mt-8 text-ink/50">Loading…</p>}

      {bookings && bookings.length === 0 && (
        <div className="mt-8 rounded-xl border border-dashed border-ink-horizon/20 p-10 text-center text-ink/50">
          No bookings yet for your packages.
        </div>
      )}

      {bookings && bookings.length > 0 && (
        <ul className="mt-8 space-y-3">
          {bookings.map((b) => (
            <li key={b.id} className="flex items-center justify-between rounded-xl border border-ink-horizon/10 bg-white px-5 py-4">
              <div>
                <p className="font-mono text-xs text-ink/40">#{b.id.slice(0, 8).toUpperCase()}</p>
                <p className="font-display text-lg text-ink-horizon">{b.travelDate}</p>
                <p className="text-xs text-ink/50">{b.travelerCount} traveler(s)</p>
              </div>
              <div className="flex items-center gap-4">
                <span className="font-mono text-sm text-ink/70">
                  {b.currency} {Number(b.totalAmount).toLocaleString()}
                </span>
                <span
                  className={`rounded-full px-3 py-1 font-mono text-[10px] uppercase tracking-[0.1em] ${
                    STATUS_STYLES[b.status] ?? "bg-ink-horizon/5 text-ink/60"
                  }`}
                >
                  {b.status.replace(/_/g, " ")}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
