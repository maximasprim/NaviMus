"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listAuditLogs, type AuditLogEntry } from "@/lib/api";
import { getToken, isLoggedIn } from "@/lib/session";

export default function AuditLogPage() {
  const [entries, setEntries] = useState<AuditLogEntry[] | null>(null);
  const [loggedIn, setLoggedIn] = useState(true);

  useEffect(() => {
    if (!isLoggedIn()) {
      setLoggedIn(false);
      return;
    }
    listAuditLogs(getToken()!, 1, 50)
      .then(({ items }) => setEntries(items))
      .catch(() => setEntries([]));
  }, []);

  if (!loggedIn) {
    return (
      <div className="p-3 text-ink/60">
        <Link href="/login" className="text-acacia underline">
          Sign in
        </Link>{" "}
        to view the audit log.
      </div>
    );
  }

  return (
    <div className="p-3">
      <p className="font-mono text-xs uppercase tracking-[0.3em] text-gold-deep">Compliance</p>
      <h1 className="mt-2 font-display text-3xl text-ink-horizon">Audit log</h1>
      <p className="mt-2 text-sm text-ink/60">Every approval, moderation action, and policy change, most recent first.</p>

      {entries === null && <p className="mt-8 text-ink/50">Loading…</p>}
      {entries && entries.length === 0 && <p className="mt-8 text-ink/50">No audit entries yet.</p>}

      <ul className="mt-6 divide-y divide-ink-horizon/10 text-sm">
        {entries?.map((e) => (
          <li key={e.id} className="py-3">
            <div className="flex items-center justify-between">
              <span className="font-mono text-ink-horizon">{e.action}</span>
              <span className="text-xs text-ink/40">{new Date(e.createdAt).toLocaleString()}</span>
            </div>
            <p className="mt-1 text-xs text-ink/50">
              {e.resourceType} {e.resourceId ? `#${e.resourceId.slice(0, 8)}` : ""} · actor {e.actorUserId.slice(0, 8)}
            </p>
            {e.metadata && Object.keys(e.metadata).length > 0 && (
              <p className="mt-1 font-mono text-xs text-ink/40">{JSON.stringify(e.metadata)}</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
