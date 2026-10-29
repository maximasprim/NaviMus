"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getAdminSupportTicket, replyToSupportTicket, setSupportTicketStatus } from "@/lib/api";
import { getToken } from "@/lib/session";

export default function AdminSupportTicketPage({ params }: { params: { id: string } }) {
  const [ticket, setTicket] = useState<Awaited<ReturnType<typeof getAdminSupportTicket>> | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);

  function reload() {
    getAdminSupportTicket(getToken()!, params.id).then(setTicket);
  }

  useEffect(reload, [params.id]);

  async function handleReply(e: React.FormEvent) {
    e.preventDefault();
    if (!reply.trim()) return;
    setSending(true);
    try {
      await replyToSupportTicket(getToken()!, params.id, reply);
      setReply("");
      reload();
    } finally {
      setSending(false);
    }
  }

  async function handleStatusChange(status: "open" | "in_progress" | "resolved" | "closed") {
    await setSupportTicketStatus(getToken()!, params.id, status);
    reload();
  }

  if (!ticket) return <div className="p-3 text-ink/50">Loading…</div>;

  return (
    <div className="p-3">
      <Link href="/support" className="text-sm text-acacia underline">
        ← All tickets
      </Link>
      <h1 className="mt-4 font-display text-2xl text-ink-horizon">{ticket.subject}</h1>

      <div className="mt-3 flex gap-2">
        {(["open", "in_progress", "resolved", "closed"] as const).map((s) => (
          <button
            key={s}
            onClick={() => handleStatusChange(s)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              ticket.status === s ? "bg-ink-horizon text-sand-light" : "bg-ink-horizon/5 text-ink/60 hover:bg-ink-horizon/10"
            }`}
          >
            {s.replace("_", " ")}
          </button>
        ))}
      </div>

      <div className="mt-8 space-y-4">
        {ticket.messages.map((m) => (
          <div key={m.id} className="rounded-xl bg-ink-horizon/5 p-4 text-sm">
            <p className="text-ink/90">{m.body}</p>
            <p className="mt-2 text-xs text-ink/40">{new Date(m.createdAt).toLocaleString()}</p>
          </div>
        ))}
      </div>

      <form onSubmit={handleReply} className="mt-8 flex gap-3">
        <input
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          placeholder="Write a reply…"
          className="flex-1 rounded-lg border border-ink-horizon/20 px-4 py-2.5 text-sm"
        />
        <button
          type="submit"
          disabled={sending}
          className="rounded-full bg-ink-horizon px-5 py-2.5 text-sm font-medium text-sand-light hover:bg-acacia disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}
