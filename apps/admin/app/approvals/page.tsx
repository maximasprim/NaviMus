"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listPendingApprovals, approveDestination, approvePackage, type PendingApprovals } from "@/lib/api";
import { getToken, isLoggedIn } from "@/lib/session";

export default function ApprovalsPage() {
  const [pending, setPending] = useState<PendingApprovals | null>(null);
  const [loggedIn, setLoggedIn] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  function load() {
    if (!isLoggedIn()) {
      setLoggedIn(false);
      return;
    }
    listPendingApprovals(getToken()!)
      .then(setPending)
      .catch(() => setPending({ destinations: [], packages: [] }));
  }

  useEffect(load, []);

  async function handleDestination(id: string, decision: "published" | "rejected") {
    setBusyId(id);
    try {
      await approveDestination(getToken()!, id, decision);
      setPending((p) => (p ? { ...p, destinations: p.destinations.filter((d) => d.id !== id) } : p));
    } finally {
      setBusyId(null);
    }
  }

  async function handlePackage(id: string, decision: "published" | "rejected") {
    setBusyId(id);
    try {
      await approvePackage(getToken()!, id, decision);
      setPending((p) => (p ? { ...p, packages: p.packages.filter((pk) => pk.id !== id) } : p));
    } finally {
      setBusyId(null);
    }
  }

  if (!loggedIn) {
    return (
      <div className="p-3 text-ink/60">
        <Link href="/login" className="text-acacia underline">
          Sign in
        </Link>{" "}
        to review pending submissions.
      </div>
    );
  }

  return (
    <div className="p-3">
      <p className="font-mono text-xs uppercase tracking-[0.3em] text-gold-deep">Operations</p>
      <h1 className="mt-2 font-display text-3xl text-ink-horizon">Pending approvals</h1>

      {pending === null && <p className="mt-8 text-ink/50">Loading…</p>}

      {pending && (
        <>
          <section className="mt-8">
            <h2 className="font-display text-lg text-ink-horizon">Destinations</h2>
            {pending.destinations.length === 0 && <p className="mt-2 text-sm text-ink/50">Nothing pending.</p>}
            <ul className="mt-3 space-y-2">
              {pending.destinations.map((d) => (
                <li key={d.id} className="flex items-center justify-between rounded-lg border border-ink-horizon/10 bg-white px-4 py-3">
                  <span>{d.name}</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleDestination(d.id, "rejected")}
                      disabled={busyId === d.id}
                      className="rounded-full border border-plum/30 px-3 py-1.5 text-xs font-medium text-plum hover:bg-plum/10 disabled:opacity-50"
                    >
                      Reject
                    </button>
                    <button
                      onClick={() => handleDestination(d.id, "published")}
                      disabled={busyId === d.id}
                      className="rounded-full bg-acacia px-3 py-1.5 text-xs font-medium text-sand-light hover:bg-acacia/90 disabled:opacity-50"
                    >
                      Approve
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="mt-10">
            <h2 className="font-display text-lg text-ink-horizon">Packages</h2>
            {pending.packages.length === 0 && <p className="mt-2 text-sm text-ink/50">Nothing pending.</p>}
            <ul className="mt-3 space-y-2">
              {pending.packages.map((p) => (
                <li key={p.id} className="flex items-center justify-between rounded-lg border border-ink-horizon/10 bg-white px-4 py-3">
                  <span>{p.name}</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handlePackage(p.id, "rejected")}
                      disabled={busyId === p.id}
                      className="rounded-full border border-plum/30 px-3 py-1.5 text-xs font-medium text-plum hover:bg-plum/10 disabled:opacity-50"
                    >
                      Reject
                    </button>
                    <button
                      onClick={() => handlePackage(p.id, "published")}
                      disabled={busyId === p.id}
                      className="rounded-full bg-acacia px-3 py-1.5 text-xs font-medium text-sand-light hover:bg-acacia/90 disabled:opacity-50"
                    >
                      Approve
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
