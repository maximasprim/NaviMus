"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listFlaggedReviews, moderateReview, type Review } from "@/lib/api";
import { getToken, isLoggedIn } from "@/lib/session";

export default function ModerationPage() {
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [loggedIn, setLoggedIn] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoggedIn()) {
      setLoggedIn(false);
      return;
    }
    listFlaggedReviews(getToken()!)
      .then(setReviews)
      .catch(() => setReviews([]));
  }, []);

  async function handleModerate(id: string, status: "published" | "removed") {
    setProcessingId(id);
    setActionError(null);
    try {
      await moderateReview(getToken()!, id, status);
      setReviews((prev) => prev?.filter((r) => r.id !== id) ?? null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Action failed.");
    } finally {
      setProcessingId(null);
    }
  }

  if (!loggedIn) {
    return (
      <div className="p-3 text-ink/60">
        <Link href="/login" className="text-acacia underline">
          Sign in
        </Link>{" "}
        to moderate reviews.
      </div>
    );
  }

  return (
    <div className="p-3">
      <p className="font-mono text-xs uppercase tracking-[0.3em] text-gold-deep">Trust &amp; safety</p>
      <h1 className="mt-2 font-display text-3xl text-ink-horizon">Flagged reviews</h1>

      {actionError && <p className="mt-4 rounded-lg bg-plum/10 px-4 py-2 text-sm text-plum">{actionError}</p>}

      {reviews === null && <p className="mt-8 text-ink/50">Loading…</p>}

      {reviews && reviews.length === 0 && (
        <div className="mt-8 rounded-xl border border-dashed border-ink-horizon/20 p-10 text-center text-ink/50">
          Nothing flagged for review.
        </div>
      )}

      {reviews && reviews.length > 0 && (
        <ul className="mt-8 space-y-3">
          {reviews.map((r) => (
            <li key={r.id} className="rounded-xl border border-ink-horizon/10 bg-white p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-ink/40">
                    {r.subjectType} · {r.rating}★ · {r.reportCount} report{r.reportCount === 1 ? "" : "s"}
                  </p>
                  {r.title && <p className="mt-1 font-display text-lg text-ink-horizon">{r.title}</p>}
                  {r.body && <p className="mt-1 text-sm text-ink/70">{r.body}</p>}
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    onClick={() => handleModerate(r.id, "removed")}
                    disabled={processingId === r.id}
                    className="rounded-full border border-plum/30 px-3 py-1.5 text-xs font-medium text-plum transition hover:bg-plum/10 disabled:opacity-50"
                  >
                    Remove
                  </button>
                  <button
                    onClick={() => handleModerate(r.id, "published")}
                    disabled={processingId === r.id}
                    className="rounded-full bg-acacia px-3 py-1.5 text-xs font-medium text-sand-light transition hover:bg-acacia/90 disabled:opacity-50"
                  >
                    Keep published
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
