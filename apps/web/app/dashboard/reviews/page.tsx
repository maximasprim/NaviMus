"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getToken } from "@/lib/session";
import { listMyReviews, type Review } from "@/lib/api";

const STATUS_LABELS: Record<string, string> = {
  published: "Published",
  pending_moderation: "Pending review",
  removed: "Removed",
};

export default function MyReviewsPage() {
  const router = useRouter();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.push("/login");
      return;
    }
    listMyReviews(token)
      .then(setReviews)
      .finally(() => setLoading(false));
  }, [router]);

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <Link href="/dashboard" className="text-sm text-acacia underline">
        ← Back to account
      </Link>
      <h1 className="mt-4 font-display text-3xl text-ink-horizon">My reviews</h1>
      <p className="mt-2 text-sm text-ink/60">
        You can leave a review from a completed trip's{" "}
        <Link href="/bookings" className="text-acacia underline">
          booking page
        </Link>
        .
      </p>

      {loading && <p className="mt-8 text-ink/50">Loading…</p>}
      {!loading && reviews.length === 0 && <p className="mt-8 text-ink/50">No reviews yet.</p>}

      <ul className="mt-6 space-y-4">
        {reviews.map((r) => (
          <li key={r.id} className="rounded-2xl border border-ink-horizon/15 p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1 text-gold-deep">
                {"★".repeat(r.rating)}
                <span className="text-ink/20">{"★".repeat(5 - r.rating)}</span>
              </div>
              <span className="text-xs uppercase tracking-wide text-ink/40">{STATUS_LABELS[r.status] ?? r.status}</span>
            </div>
            {r.title && <p className="mt-2 font-medium text-ink-horizon">{r.title}</p>}
            {r.body && <p className="mt-1 text-sm text-ink/70">{r.body}</p>}
            {r.operatorResponse && (
              <div className="mt-3 rounded-xl bg-ink-horizon/5 p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-ink/50">Operator response</p>
                <p className="mt-1 text-sm text-ink/70">{r.operatorResponse}</p>
              </div>
            )}
            <p className="mt-3 text-xs text-ink/40">{new Date(r.createdAt).toLocaleDateString()}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
