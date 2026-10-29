"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getBooking } from "@/lib/api";
import { getToken, isLoggedIn } from "@/lib/session";
import { ReviewForm } from "@/components/review-form";
import { useSiteName } from "@/components/site-brand";

const STATUS_STYLES: Record<string, string> = {
  CONFIRMED: "bg-acacia/10 text-acacia",
  PENDING_PAYMENT: "bg-gold/10 text-gold-deep",
  PAYMENT_PROCESSING: "bg-gold/10 text-gold-deep",
  CANCELLED: "bg-plum/10 text-plum",
  EXPIRED: "bg-plum/10 text-plum",
  FAILED: "bg-plum/10 text-plum",
};

export default function BookingDetailPage({ params }: { params: { id: string } }) {
  const siteName = useSiteName();
  const [booking, setBooking] = useState<Awaited<ReturnType<typeof getBooking>> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoggedIn()) {
      setError("Sign in to view this booking.");
      return;
    }
    getBooking(getToken()!, params.id)
      .then(setBooking)
      .catch(() => setError("This booking could not be found."));
  }, [params.id]);

  if (error) {
    return (
      <div className="mx-auto max-w-md px-6 py-20 text-center text-ink/60">
        {error}{" "}
        <Link href="/login" className="text-acacia underline">
          Sign in
        </Link>
      </div>
    );
  }

  if (!booking) {
    return <div className="mx-auto max-w-md px-6 py-20 text-ink/50">Loading…</div>;
  }

  return (
    <div className="mx-auto max-w-xl px-6 py-16">
      <p className="font-mono text-xs uppercase tracking-[0.3em] text-gold-deep">Booking confirmation</p>

      {/* Boarding-pass styled ticket */}
      <div className="mt-6 overflow-hidden rounded-2xl border border-ink-horizon/10 bg-sand-light shadow-sm">
        <div className="flex items-center justify-between bg-ink-horizon px-6 py-4">
          <span className="font-display text-xl text-sand-light">{siteName}</span>
          <span
            className={`rounded-full px-3 py-1 font-mono text-[10px] uppercase tracking-[0.1em] ${
              STATUS_STYLES[booking.status] ?? "bg-sand/20 text-sand"
            }`}
          >
            {booking.status.replace(/_/g, " ")}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-6 p-6">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-ink/40">Booking reference</p>
            <p className="mt-1 font-mono text-lg text-ink-horizon">{booking.id.slice(0, 8).toUpperCase()}</p>
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-ink/40">Travel date</p>
            <p className="mt-1 font-mono text-lg text-ink-horizon">{booking.travelDate}</p>
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-ink/40">Travelers</p>
            <p className="mt-1 font-mono text-lg text-ink-horizon">{booking.travelerCount}</p>
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-ink/40">Total</p>
            <p className="mt-1 font-mono text-lg text-acacia">
              {booking.currency} {Number(booking.totalAmount).toLocaleString()}
            </p>
          </div>
        </div>

        <div className="tear-line" />

        <div className="p-6">
          <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-ink/40">Contact</p>
          <p className="mt-1 text-sm text-ink/70">{booking.contactEmail}</p>
        </div>
      </div>

      {booking.items.length > 0 && (
        <div className="mt-6">
          <h2 className="font-display text-lg text-ink-horizon">Included</h2>
          <ul className="mt-2 space-y-2">
            {booking.items.map((item: any) => (
              <li key={item.id} className="flex justify-between rounded-lg bg-sand-light px-4 py-3 text-sm">
                <span className="text-ink/70">{item.description ?? item.itemType}</span>
                <span className="font-mono text-ink/70">
                  {item.currency} {Number(item.amount).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {booking.statusHistory.length > 0 && (
        <div className="mt-6">
          <h2 className="font-display text-lg text-ink-horizon">Timeline</h2>
          <ul className="mt-2 space-y-2 border-l-2 border-ink-horizon/10 pl-4">
            {[...booking.statusHistory].reverse().map((h: any) => (
              <li key={h.id} className="text-sm">
                <span className="font-mono text-ink/40">{new Date(h.createdAt).toLocaleString()}</span>{" "}
                <span className="text-ink/70">→ {h.toStatus.replace(/_/g, " ")}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {booking.status === "COMPLETED" && booking.packageId && (
        <ReviewForm bookingId={booking.id} packageId={booking.packageId} />
      )}
    </div>
  );
}
