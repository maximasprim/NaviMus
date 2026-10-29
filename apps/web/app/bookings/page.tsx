"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listMyBookings, type Booking } from "@/lib/api";
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
  const [bookings, setBookings] = useState<Booking[] | null>(null);
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
      <div className="mx-auto max-w-2xl px-6 py-20 text-center">
        <p className="text-ink/60">
          Sign in to see your trips.{" "}
          <Link href="/login" className="text-acacia underline">
            Sign in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <p className="font-mono text-xs uppercase tracking-[0.3em] text-gold-deep">Your account</p>
      <h1 className="mt-2 font-display text-4xl text-ink-horizon">My trips</h1>

      {bookings === null && <p className="mt-8 text-ink/50">Loading…</p>}

      {bookings && bookings.length === 0 && (
        <div className="mt-12 rounded-2xl border border-dashed border-ink-horizon/20 p-12 text-center text-ink/50">
          No trips booked yet.{" "}
          <Link href="/packages" className="text-acacia underline">
            Browse packages
          </Link>
        </div>
      )}

      {bookings && bookings.length > 0 && (
        <ul className="mt-8 space-y-3">
          {bookings.map((b) => (
            <li key={b.id}>
              <Link
                href={`/bookings/${b.id}`}
                className="flex items-center justify-between rounded-xl border border-ink-horizon/10 bg-sand-light px-5 py-4 transition hover:shadow-sm"
              >
                <div>
                  <p className="font-mono text-xs text-ink/40">#{b.id.slice(0, 8).toUpperCase()}</p>
                  <p className="font-display text-lg text-ink-horizon">{b.travelDate}</p>
                </div>
                <div className="flex items-center gap-4">
                  <span className="font-mono text-sm text-ink/70">
                    {b.currency} {Number(b.totalAmount).toLocaleString()}
                  </span>
                  <span
                    className={`rounded-full px-3 py-1 font-mono text-[10px] uppercase tracking-[0.1em] ${
                      STATUS_STYLES[b.status] ?? "bg-ink-horizon/10 text-ink/60"
                    }`}
                  >
                    {b.status.replace(/_/g, " ")}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
