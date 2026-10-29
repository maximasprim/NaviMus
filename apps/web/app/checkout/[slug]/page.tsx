"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBooking, createPaymentIntent, getPackage, getPackageQuote, type Quote, type TravelPackage } from "@/lib/api";
import { getToken, isLoggedIn } from "@/lib/session";
import { ApiError } from "@/lib/api-client";

export default function CheckoutPage({ params }: { params: { slug: string } }) {
  const router = useRouter();
  const [pkg, setPkg] = useState<TravelPackage | null>(null);
  const [travelDate, setTravelDate] = useState("");
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [provider, setProvider] = useState<"mpesa" | "stripe">("mpesa");
  const [phoneNumber, setPhoneNumber] = useState("");

  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<"booked" | "paid" | null>(null);

  useEffect(() => {
    getPackage(params.slug)
      .then(setPkg)
      .catch(() => setPkg(null));
  }, [params.slug]);

  // Re-quote whenever the date or traveler counts change - the price
  // shown is always the server's, never computed client-side.
  useEffect(() => {
    if (!pkg || !travelDate) {
      setQuote(null);
      return;
    }
    setQuoteLoading(true);
    setQuoteError(null);
    getPackageQuote(pkg.id, travelDate, { adults, children, infants: 0 })
      .then(setQuote)
      .catch((err) => {
        setQuote(null);
        setQuoteError(err instanceof ApiError ? err.message : "Could not price this trip");
      })
      .finally(() => setQuoteLoading(false));
  }, [pkg, travelDate, adults, children]);

  async function handleBookAndPay(e: React.FormEvent) {
    e.preventDefault();
    if (!pkg) return;

    if (!isLoggedIn()) {
      router.push(`/login?next=/checkout/${params.slug}`);
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    try {
      const token = getToken()!;
      const travelers = [
        ...Array.from({ length: adults }, () => ({ travelerType: "adult" as const })),
        ...Array.from({ length: children }, () => ({ travelerType: "child" as const })),
      ];
      const idempotencyKey = `web-${pkg.id}-${travelDate}-${Date.now()}`;

      const booking = await createBooking(token, idempotencyKey, {
        packageId: pkg.id,
        travelDate,
        travelers,
        contactEmail,
        contactPhone,
      });
      setResult("booked");

      await createPaymentIntent(token, {
        bookingId: booking.id,
        provider,
        phoneNumber: provider === "mpesa" ? phoneNumber : undefined,
      });
      setResult("paid");

      router.push(`/bookings/${booking.id}`);
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!pkg) {
    return <div className="mx-auto max-w-2xl px-6 py-20 text-ink/50">Loading package details…</div>;
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <p className="font-mono text-xs uppercase tracking-[0.3em] text-gold-deep">Checkout</p>
      <h1 className="mt-2 font-display text-4xl text-ink-horizon">{pkg.name}</h1>

      <form onSubmit={handleBookAndPay} className="mt-10 space-y-8">
        <fieldset className="space-y-4">
          <legend className="font-display text-lg text-ink-horizon">Trip details</legend>
          <div>
            <label htmlFor="travelDate" className="block text-sm font-medium text-ink/80">
              Travel date
            </label>
            <input
              id="travelDate"
              type="date"
              required
              value={travelDate}
              onChange={(e) => setTravelDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-ink-horizon/20 bg-sand-light px-4 py-2.5 text-ink focus-visible:border-gold"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="adults" className="block text-sm font-medium text-ink/80">
                Adults
              </label>
              <input
                id="adults"
                type="number"
                min={1}
                value={adults}
                onChange={(e) => setAdults(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-ink-horizon/20 bg-sand-light px-4 py-2.5 text-ink focus-visible:border-gold"
              />
            </div>
            <div>
              <label htmlFor="children" className="block text-sm font-medium text-ink/80">
                Children
              </label>
              <input
                id="children"
                type="number"
                min={0}
                value={children}
                onChange={(e) => setChildren(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-ink-horizon/20 bg-sand-light px-4 py-2.5 text-ink focus-visible:border-gold"
              />
            </div>
          </div>
        </fieldset>

        {/* Live, server-computed quote - never calculated in the browser */}
        <div className="rounded-2xl border border-ink-horizon/10 bg-sand-light">
          <div className="bg-ink-horizon px-5 py-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-gold">Price</p>
          </div>
          <div className="p-5">
            {quoteLoading && <p className="text-ink/50">Calculating…</p>}
            {quoteError && <p className="text-plum">{quoteError}</p>}
            {quote && (
              <>
                <ul className="space-y-1 text-sm text-ink/70">
                  {quote.lineItems.map((li) => (
                    <li key={li.travelerType} className="flex justify-between">
                      <span>
                        {li.count} × {li.travelerType}
                      </span>
                      <span className="font-mono">
                        {li.currency} {li.subtotal.toLocaleString()}
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="mt-3 flex justify-between border-t border-ink-horizon/10 pt-3 font-mono text-lg font-semibold text-acacia">
                  <span>Total</span>
                  <span>
                    {quote.currency} {quote.subtotal.toLocaleString()}
                  </span>
                </div>
              </>
            )}
            {!quote && !quoteLoading && !quoteError && (
              <p className="text-ink/40">Pick a travel date to see pricing.</p>
            )}
          </div>
        </div>

        <fieldset className="space-y-4">
          <legend className="font-display text-lg text-ink-horizon">Contact</legend>
          <div>
            <label htmlFor="contactEmail" className="block text-sm font-medium text-ink/80">
              Email
            </label>
            <input
              id="contactEmail"
              type="email"
              required
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border border-ink-horizon/20 bg-sand-light px-4 py-2.5 text-ink focus-visible:border-gold"
            />
          </div>
          <div>
            <label htmlFor="contactPhone" className="block text-sm font-medium text-ink/80">
              Phone
            </label>
            <input
              id="contactPhone"
              type="tel"
              required
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              className="mt-1 w-full rounded-lg border border-ink-horizon/20 bg-sand-light px-4 py-2.5 text-ink focus-visible:border-gold"
            />
          </div>
        </fieldset>

        <fieldset className="space-y-4">
          <legend className="font-display text-lg text-ink-horizon">Payment method</legend>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setProvider("mpesa")}
              className={`flex-1 rounded-lg border px-4 py-3 text-sm font-medium transition ${
                provider === "mpesa" ? "border-gold bg-gold/10 text-gold-deep" : "border-ink-horizon/20 text-ink/60"
              }`}
            >
              M-Pesa
            </button>
            <button
              type="button"
              onClick={() => setProvider("stripe")}
              className={`flex-1 rounded-lg border px-4 py-3 text-sm font-medium transition ${
                provider === "stripe" ? "border-gold bg-gold/10 text-gold-deep" : "border-ink-horizon/20 text-ink/60"
              }`}
            >
              Card
            </button>
          </div>
          {provider === "mpesa" && (
            <div>
              <label htmlFor="phoneNumber" className="block text-sm font-medium text-ink/80">
                M-Pesa phone number
              </label>
              <input
                id="phoneNumber"
                type="tel"
                required
                placeholder="+2547..."
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                className="mt-1 w-full rounded-lg border border-ink-horizon/20 bg-sand-light px-4 py-2.5 text-ink focus-visible:border-gold"
              />
            </div>
          )}
        </fieldset>

        {submitError && (
          <p role="alert" className="rounded-lg bg-plum/10 px-4 py-3 text-sm text-plum">
            {submitError}
          </p>
        )}
        {result === "booked" && (
          <p className="rounded-lg bg-acacia/10 px-4 py-3 text-sm text-acacia">
            Booking created - initiating payment…
          </p>
        )}

        <button
          type="submit"
          disabled={submitting || !quote}
          className="w-full rounded-full bg-gold px-6 py-3 font-body text-sm font-semibold text-ink-horizon transition hover:bg-gold-soft disabled:opacity-50"
        >
          {submitting ? "Processing…" : "Book and pay"}
        </button>
      </form>
    </div>
  );
}
