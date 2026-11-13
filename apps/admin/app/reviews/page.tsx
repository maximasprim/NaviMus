"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { listReviewsAdmin, moderateReview, type ReviewRow } from "@/lib/api";
import { getToken } from "@/lib/session";
import { Btn, Notice, StatusBadge, errMsg, inputCls } from "@/components/detail-ui";
import { Pager } from "@/components/pager";

export default function ReviewsPage() {
  const [items, setItems] = useState<ReviewRow[] | null>(null);
  const [meta, setMeta] = useState<any>(null);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [rating, setRating] = useState("");
  const [reported, setReported] = useState(false);
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    listReviewsAdmin(getToken()!, { page, status: status || undefined, rating: rating ? Number(rating) : undefined, reportedOnly: reported, search: search || undefined })
      .then((r) => {
        setItems(r.items);
        setMeta(r.meta);
        setError(null);
      })
      .catch((e) => {
        setItems([]);
        setError(errMsg(e, "Could not load reviews."));
      });
  }, [page, status, rating, reported, search]);
  useEffect(load, [load]);

  async function moderate(r: ReviewRow, to: "published" | "removed") {
    setBusyId(r.id);
    setError(null);
    try {
      await moderateReview(getToken()!, r.id, to);
      load();
    } catch (e) {
      setError(errMsg(e, "That didn't work."));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6 p-8">
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-gold-deep">Community</p>
        <h1 className="mt-2 font-display text-3xl text-ink-horizon">Reviews</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink/60">Every review in every status. Publish or remove a review at any time. Reports are shown with a count.</p>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          setSearch(term.trim());
        }}
        className="flex flex-wrap items-center gap-3"
      >
        <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search text or reviewer email" className={`${inputCls} !mt-0 w-64`} />
        <select value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }} className={`${inputCls} !mt-0 w-40`}>
          <option value="">Any status</option>
          {["pending_moderation", "published", "removed"].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={rating} onChange={(e) => { setPage(1); setRating(e.target.value); }} className={`${inputCls} !mt-0 w-32`}>
          <option value="">Any rating</option>
          {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} stars</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm text-ink-horizon">
          <input type="checkbox" checked={reported} onChange={(e) => { setPage(1); setReported(e.target.checked); }} />
          Reported only
        </label>
      </form>
      {error && <Notice kind="error">{error}</Notice>}
      {items === null && <p className="text-sm text-ink/50">Loading…</p>}
      {items && items.length === 0 && !error && <p className="text-sm text-ink/50">No reviews match.</p>}
      <ul className="space-y-3">
        {items?.map((r) => {
          const who = [r.userFirstName, r.userLastName].filter(Boolean).join(" ") || r.userEmail || "Unknown";
          return (
            <li key={r.id} className="rounded-xl border border-ink-horizon/10 bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="font-display text-lg text-ink-horizon">{"★".repeat(r.rating)}<span className="text-ink/20">{"★".repeat(5 - r.rating)}</span></span>
                  <StatusBadge value={r.status} />
                  {r.reportCount > 0 && <span className="rounded-full bg-plum/10 px-2.5 py-0.5 text-xs text-plum">{r.reportCount} report{r.reportCount === 1 ? "" : "s"}</span>}
                </div>
                <div className="flex gap-2">
                  {r.status !== "published" && <Btn tone="primary" disabled={busyId === r.id} onClick={() => moderate(r, "published")}>Publish</Btn>}
                  {r.status !== "removed" && <Btn tone="dangerOutline" disabled={busyId === r.id} onClick={() => moderate(r, "removed")}>Remove</Btn>}
                </div>
              </div>
              {r.title && <p className="mt-3 font-medium text-ink-horizon">{r.title}</p>}
              {r.body && <p className="mt-1 text-sm text-ink/70">{r.body}</p>}
              {r.operatorResponse && <p className="mt-2 border-l-2 border-gold-deep/40 pl-3 text-sm text-ink/60">Operator reply: {r.operatorResponse}</p>}
              <p className="mt-3 text-xs text-ink/40">
                <Link href={`/users/${r.userId}`} className="hover:underline">{who}</Link>
                {" · "}{r.subjectType}
                {r.bookingId && <> · <Link href={`/bookings/${r.bookingId}`} className="hover:underline">booking</Link></>}
                {" · "}{new Date(r.createdAt).toLocaleDateString()}
              </p>
            </li>
          );
        })}
      </ul>
      <Pager page={page} meta={meta} onPage={setPage} />
    </div>
  );
}
