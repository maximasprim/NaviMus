"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listAllSupportTickets, type AdminSupportTicket } from "@/lib/api";
import { getToken, isLoggedIn } from "@/lib/session";

export default function AdminSupportPage() {
  const [tickets, setTickets] = useState<AdminSupportTicket[] | null>(null);
  const [status, setStatus] = useState("");
  const [loggedIn, setLoggedIn] = useState(true);

  useEffect(() => {
    if (!isLoggedIn()) {
      setLoggedIn(false);
      return;
    }
    listAllSupportTickets(getToken()!, status || undefined)
      .then(setTickets)
      .catch(() => setTickets([]));
  }, [status]);

  if (!loggedIn) {
    return (
      <div className="p-3 text-ink/60">
        <Link href="/login" className="text-acacia underline">
          Sign in
        </Link>{" "}
        to view support tickets.
      </div>
    );
  }

  return (
    <div className="p-3">
      <p className="font-mono text-xs uppercase tracking-[0.3em] text-gold-deep">Support</p>
      <h1 className="mt-2 font-display text-3xl text-ink-horizon">Tickets</h1>

      <select
        value={status}
        onChange={(e) => setStatus(e.target.value)}
        className="mt-4 rounded-lg border border-ink-horizon/20 bg-white px-3 py-2 text-sm"
      >
        <option value="">All statuses</option>
        <option value="open">Open</option>
        <option value="in_progress">In progress</option>
        <option value="resolved">Resolved</option>
        <option value="closed">Closed</option>
      </select>

      {tickets === null && <p className="mt-8 text-ink/50">Loading…</p>}
      {tickets && tickets.length === 0 && <p className="mt-8 text-ink/50">No tickets match this filter.</p>}

      <ul className="mt-6 divide-y divide-ink-horizon/10">
        {tickets?.map((t) => (
          <li key={t.id}>
            <Link href={`/support/${t.id}`} className="flex items-center justify-between py-3 hover:text-acacia">
              <span>{t.subject}</span>
              <span className="text-xs uppercase tracking-wide text-ink/40">{t.status.replace("_", " ")}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
