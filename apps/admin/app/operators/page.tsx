"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  listDeletedOperators,
  listOperatorsByStatus,
  reinstateOperator,
  restoreOperator,
  reviewOperator,
  suspendOperator,
  type Operator,
  type OperatorStatus,
} from "@/lib/api";
import { getToken, isLoggedIn } from "@/lib/session";
import { useCan, useReadOnly } from "@/lib/access";
import { ACTIONS } from "@/lib/access-rules";

type Tab = OperatorStatus | "deleted";
const TABS: { status: Tab; label: string; empty: string }[] = [
  { status: "pending", label: "Pending", empty: "No operators awaiting review." },
  { status: "approved", label: "Approved", empty: "No approved operators yet." },
  { status: "rejected", label: "Rejected", empty: "No rejected operators." },
  { status: "suspended", label: "Suspended", empty: "No suspended operators." },
  { status: "deleted", label: "Deleted", empty: "No deleted operators." },
];

const STATUS_STYLE: Record<OperatorStatus, string> = {
  pending: "bg-gold/15 text-gold-deep",
  approved: "bg-acacia/15 text-acacia",
  rejected: "bg-plum/10 text-plum",
  suspended: "bg-ink-horizon/10 text-ink/60",
};

export default function OperatorsPage() {
  const readOnly = useReadOnly(ACTIONS.manageOperators);
  const canManage = useCan(ACTIONS.manageOperators); // travel managers can look; only admins may approve/reject/suspend
  const [status, setStatus] = useState<Tab>("pending");
  const [operators, setOperators] = useState<Operator[] | null>(null);
  const [loggedIn, setLoggedIn] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  // Only the latest request may update the list, so quickly switching tabs can't show the wrong tab's rows.
  const latest = useRef(0);

  const load = useCallback((which: Tab) => {
    const id = ++latest.current;
    setOperators(null);
    setLoadError(null);
    (which === "deleted" ? listDeletedOperators(getToken()!) : listOperatorsByStatus(getToken()!, which))
      .then((rows) => {
        if (id === latest.current) setOperators(rows);
      })
      .catch((err) => {
        if (id !== latest.current) return;
        setOperators([]);
        setLoadError(err instanceof Error ? err.message : "Could not load operators.");
      });
  }, []);

  useEffect(() => {
    if (!isLoggedIn()) {
      setLoggedIn(false);
      return;
    }
    load(status);
  }, [status, load]);

  function switchTab(next: Tab) {
    if (next === status) return;
    setActionError(null);
    setStatus(next);
  }

  async function handleReview(id: string, decision: "approved" | "rejected") {
    setProcessingId(id);
    setActionError(null);
    try {
      await reviewOperator(getToken()!, id, decision);
      setOperators((prev) => prev?.filter((o) => o.id !== id) ?? null); // it moved to another tab
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Action failed.");
    } finally {
      setProcessingId(null);
    }
  }

  async function handleRestore(op: Operator) {
    if (!window.confirm(`Restore ${op.businessName}? It comes back suspended; reinstate it to let them manage listings again.`)) return;
    setProcessingId(op.id);
    setActionError(null);
    try {
      await restoreOperator(getToken()!, op.id);
      setOperators((prev) => prev?.filter((o) => o.id !== op.id) ?? null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not restore operator.");
    } finally {
      setProcessingId(null);
    }
  }

  async function handleReinstate(op: Operator) {
    const msg =
      op.status === "suspended"
        ? `Reinstate ${op.businessName}? They will be able to manage listings again.`
        : `Reopen ${op.businessName}'s application for review?`;
    if (!window.confirm(msg)) return;
    setProcessingId(op.id);
    setActionError(null);
    try {
      await reinstateOperator(getToken()!, op.id);
      setOperators((prev) => prev?.filter((o) => o.id !== op.id) ?? null); // it moved to another tab
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not reinstate operator.");
    } finally {
      setProcessingId(null);
    }
  }

  async function handleSuspend(op: Operator) {
    if (!window.confirm(`Suspend ${op.businessName}? They will no longer be able to manage listings.`)) return;
    setProcessingId(op.id);
    setActionError(null);
    try {
      await suspendOperator(getToken()!, op.id);
      setOperators((prev) => prev?.filter((o) => o.id !== op.id) ?? null); // it moved to the Suspended tab
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not suspend operator.");
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
        to manage operators.
      </div>
    );
  }

  const tab = TABS.find((t) => t.status === status)!;

  return (
    <div className="p-3">
      <p className="font-mono text-xs uppercase tracking-[0.3em] text-gold-deep">Partner management</p>
      <h1 className="mt-2 font-display text-3xl text-ink-horizon">Operators</h1>

      <div role="tablist" aria-label="Operator status" className="mt-6 flex gap-1 border-b border-ink-horizon/10">
        {TABS.map((t) => {
          const active = t.status === status;
          return (
            <button
              key={t.status}
              role="tab"
              aria-selected={active}
              onClick={() => switchTab(t.status)}
              className={`-mb-px border-b-2 px-4 py-2 text-sm transition-colors ${
                active
                  ? "border-gold font-medium text-ink-horizon"
                  : "border-transparent text-ink/50 hover:text-ink-horizon"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {readOnly && (
        <p className="mt-4 rounded-lg bg-ink-horizon/5 px-4 py-2 text-sm text-ink/60">
          View only: approving, rejecting, suspending and reinstating operators is done by an administrator.
        </p>
      )}
      {actionError && <p className="mt-4 rounded-lg bg-plum/10 px-4 py-2 text-sm text-plum">{actionError}</p>}
      {loadError && <p className="mt-4 rounded-lg bg-plum/10 px-4 py-2 text-sm text-plum">{loadError}</p>}

      {operators === null && <p className="mt-8 text-ink/50">Loading…</p>}

      {operators && operators.length === 0 && !loadError && (
        <div className="mt-8 rounded-xl border border-dashed border-ink-horizon/20 p-10 text-center text-ink/50">
          {tab.empty}
        </div>
      )}

      {operators && operators.length > 0 && (
        <table className="mt-8 w-full border-collapse overflow-hidden rounded-xl border border-ink-horizon/10 bg-white text-sm">
          <thead>
            <tr className="border-b border-ink-horizon/10 bg-ink-horizon/[0.03] text-left">
              <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-[0.15em] text-ink/40">Business</th>
              <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-[0.15em] text-ink/40">Contact</th>
              <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-[0.15em] text-ink/40">Status</th>
              <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-[0.15em] text-ink/40">Applied</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {operators.map((op) => (
              <tr key={op.id} className="border-b border-ink-horizon/5 last:border-0">
                <td className="px-4 py-3 text-ink-horizon">
                  <Link href={`/operators/${op.id}`} className="underline-offset-2 hover:underline">
                    {op.businessName}
                  </Link>
                </td>
                <td className="px-4 py-3 text-ink/60">{op.contactEmail}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${STATUS_STYLE[op.status]}`}>
                    {op.status}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-ink/40">
                  {new Date(op.createdAt).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-2">
                  {status !== "deleted" && (
                    <Link
                      href={`/operators/${op.id}`}
                      className="rounded-full border border-ink-horizon/20 px-3 py-1.5 text-xs font-medium text-ink-horizon transition hover:bg-ink-horizon/5"
                    >
                      View
                    </Link>
                  )}
                  {canManage && status === "deleted" && (
                    <button
                      onClick={() => handleRestore(op)}
                      disabled={processingId === op.id}
                      className="rounded-full bg-acacia px-3 py-1.5 text-xs font-medium text-sand-light transition hover:bg-acacia/90 disabled:opacity-50"
                    >
                      Restore
                    </button>
                  )}
                  {canManage && (status === "suspended" || status === "rejected") && (
                    <button
                      onClick={() => handleReinstate(op)}
                      disabled={processingId === op.id}
                      className="rounded-full bg-acacia px-3 py-1.5 text-xs font-medium text-sand-light transition hover:bg-acacia/90 disabled:opacity-50"
                    >
                      {status === "suspended" ? "Reinstate" : "Reopen"}
                    </button>
                  )}
                  {canManage && status === "pending" && (
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
                  )}
                  {canManage && status === "approved" && (
                    <button
                      onClick={() => handleSuspend(op)}
                      disabled={processingId === op.id}
                      className="rounded-full border border-plum/30 px-3 py-1.5 text-xs font-medium text-plum transition hover:bg-plum/10 disabled:opacity-50"
                    >
                      Suspend
                    </button>
                  )}
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
