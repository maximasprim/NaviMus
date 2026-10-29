"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listMyPackages, listReviewsForPackage, respondToReview, type OperatorPackage, type MyReview } from "@/lib/api";
import { getToken, isLoggedIn } from "@/lib/session";

export default function ReviewsPage() {
  const [packages, setPackages] = useState<OperatorPackage[]>([]);
  const [reviewsByPackage, setReviewsByPackage] = useState<Record<string, MyReview[]>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isLoggedIn()) {
      setLoading(false);
      return;
    }
    const token = getToken()!;
    listMyPackages(token).then(async (pkgs) => {
      setPackages(pkgs);
      const entries = await Promise.all(pkgs.map(async (p) => [p.id, await listReviewsForPackage(p.id)] as const));
      setReviewsByPackage(Object.fromEntries(entries));
      setLoading(false);
    });
  }, []);

  async function handleRespond(reviewId: string, packageId: string) {
    const response = drafts[reviewId];
    if (!response?.trim()) return;
    const updated = await respondToReview(getToken()!, reviewId, response);
    setReviewsByPackage((prev) => ({
      ...prev,
      [packageId]: prev[packageId].map((r) => (r.id === reviewId ? updated : r)),
    }));
    setDrafts((prev) => ({ ...prev, [reviewId]: "" }));
  }

  if (!isLoggedIn()) {
    return (
      <div className="text-ink/60">
        <Link href="/login" className="text-acacia underline">
          Sign in
        </Link>{" "}
        to respond to reviews.
      </div>
    );
  }

  if (loading) return <p className="text-ink/50">Loading…</p>;

  const allReviews = packages.flatMap((p) => (reviewsByPackage[p.id] ?? []).map((r) => ({ ...r, packageName: p.name })));

  return (
    <div>
      <p className="font-mono text-xs uppercase tracking-[0.3em] text-gold-deep">Reputation</p>
      <h1 className="mt-2 font-display text-3xl text-ink-horizon">Reviews</h1>

      {allReviews.length === 0 && <p className="mt-8 text-ink/50">No reviews on your packages yet.</p>}

      <ul className="mt-6 space-y-4">
        {allReviews.map((r: any) => (
          <li key={r.id} className="rounded-xl border border-ink-horizon/10 bg-white p-5">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-wide text-ink/40">{r.packageName}</p>
              <div className="text-gold-deep">
                {"★".repeat(r.rating)}
                <span className="text-ink/20">{"★".repeat(5 - r.rating)}</span>
              </div>
            </div>
            {r.title && <p className="mt-2 font-medium text-ink-horizon">{r.title}</p>}
            {r.body && <p className="mt-1 text-sm text-ink/70">{r.body}</p>}

            {r.operatorResponse ? (
              <div className="mt-3 rounded-lg bg-ink-horizon/5 p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-ink/50">Your response</p>
                <p className="mt-1 text-sm text-ink/70">{r.operatorResponse}</p>
              </div>
            ) : (
              <div className="mt-3 flex gap-2">
                <input
                  value={drafts[r.id] ?? ""}
                  onChange={(e) => setDrafts((prev) => ({ ...prev, [r.id]: e.target.value }))}
                  placeholder="Write a response…"
                  className="flex-1 rounded-lg border border-ink-horizon/20 px-3 py-2 text-sm"
                />
                <button
                  onClick={() => handleRespond(r.id, r.subjectId)}
                  className="rounded-full bg-ink-horizon px-4 py-2 text-sm font-medium text-sand-light hover:bg-acacia"
                >
                  Reply
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
