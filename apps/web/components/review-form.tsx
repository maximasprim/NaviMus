"use client";

import { useState } from "react";
import { getToken } from "@/lib/session";
import { createReview } from "@/lib/api";
import { ApiError } from "@/lib/api-client";

export function ReviewForm({ bookingId, packageId }: { bookingId: string; packageId: string }) {
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token) return;
    setError(null);
    setSubmitting(true);
    try {
      await createReview(token, { bookingId, subjectType: "package", subjectId: packageId, rating, title, body });
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't submit that review - try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="mt-6 rounded-2xl bg-acacia/10 p-5 text-sm text-acacia">
        Thanks - your review has been submitted.
      </div>
    );
  }

  return (
    <div className="mt-6 rounded-2xl border border-ink-horizon/15 p-5">
      <h2 className="font-display text-lg text-ink-horizon">Leave a review</h2>
      <form onSubmit={handleSubmit} className="mt-3 space-y-3">
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setRating(n)}
              className={`text-2xl ${n <= rating ? "text-gold-deep" : "text-ink/20"}`}
              aria-label={`${n} star${n > 1 ? "s" : ""}`}
            >
              ★
            </button>
          ))}
        </div>
        <input
          placeholder="Title (optional)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded-lg border border-ink-horizon/20 bg-sand-light px-4 py-2.5 text-sm text-ink"
        />
        <textarea
          placeholder="How was the trip?"
          rows={3}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="w-full rounded-lg border border-ink-horizon/20 bg-sand-light px-4 py-2.5 text-sm text-ink"
        />
        {error && <p className="text-sm text-plum">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="rounded-full bg-ink-horizon px-5 py-2 text-sm font-semibold text-sand-light hover:bg-acacia disabled:opacity-50"
        >
          {submitting ? "Submitting…" : "Submit review"}
        </button>
      </form>
    </div>
  );
}
