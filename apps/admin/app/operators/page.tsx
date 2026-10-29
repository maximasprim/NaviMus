"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listPendingOperators, reviewOperator, type Operator } from "@/lib/api";
import { getToken, isLoggedIn } from "@/lib/session";

export default function OperatorsPage() {
  const [operators, setOperators] = useState<Operator[] | null>(null);
  const [loggedIn, setLoggedIn] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  function load() {
    listPendingOperators(getToken()!)
      .then(setOperators)
      .catch(() => setOperators([]));
  }

  useEffect(() => {
    if (!isLoggedIn()) {
      setLoggedIn(false);
      return;
    }
    load();
  }, []);

  async function handleReview(id: string, decision: "approved" | "rejected") {
    setProcessingId(id);
    setActionError(null);
    try {
      await reviewOperator(getToken()!, id, decision);
      setOperators((prev) => prev?.filter((o) => o.id !== id) ?? null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Action failed.");
    } finally {
      setProcessingId(null);
    }
  }

  if (!loggedIn) {
    return (
      <div className="p-10 text-ink/60">
        <Link href="/login" className="text-acacia underline">
          Sign in
        </Link>{" "}
        to review operators.
      </div>
    );
  }

  return (
    <div className="p-3">
      <p className="font-mono text-xs uppercase tracking-[0.3em] text-gold-deep">Partner approvals</p>
      <h1 className="mt-2 font-display text-3xl text-ink-horizon">Pending operators</h1>

      {actionError && <p className="mt-4 rounded-lg bg-plum/10 px-4 py-2 text-sm text-plum">{actionError}</p>}

      {operators === null && <p className="mt-8 text-ink/50">Loading…</p>}

      {operators && operators.length === 0 && (
        <div className="mt-8 rounded-xl border border-dashed border-ink-horizon/20 p-10 text-center text-ink/50">
          No operators awaiting review.
        </div>
      )}

      {operators && operators.length > 0 && (
        <table className="mt-8 w-full border-collapse overflow-hidden rounded-xl border border-ink-horizon/10 bg-white text-sm">
          <thead>
            <tr className="border-b border-ink-horizon/10 bg-ink-horizon/[0.03] text-left">
              <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-[0.15em] text-ink/40">Business</th>
              <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-[0.15em] text-ink/40">Contact</th>
              <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-[0.15em] text-ink/40">Applied</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {operators.map((op) => (
              <tr key={op.id} className="border-b border-ink-horizon/5 last:border-0">
                <td className="px-4 py-3 text-ink-horizon">{op.businessName}</td>
                <td className="px-4 py-3 text-ink/60">{op.contactEmail}</td>
                <td className="px-4 py-3 font-mono text-xs text-ink/40">
                  {new Date(op.createdAt).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => handleReview(op.id, "rejected")}
                      disabled={processingId === op.id}
                      className="rounded-full border border-plum/30 px-3 py-1.5 text-xs font-medium text-plum transition hover:bg-plum/10 disabled:opacity-50"
                    >
                      Reject
                    </button>
                    <button
                      onClick={() => handleReview(op.id, "approved")}
                      disabled={processingId === op.id}
                      className="rounded-full bg-acacia px-3 py-1.5 text-xs font-medium text-sand-light transition hover:bg-acacia/90 disabled:opacity-50"
                    >
                      Approve
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
