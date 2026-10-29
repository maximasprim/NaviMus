"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { getToken } from "@/lib/session";
import { getSupportTicket, addSupportMessage, type SupportTicket, type SupportMessage } from "@/lib/api";

export default function SupportTicketPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [ticket, setTicket] = useState<(SupportTicket & { messages: SupportMessage[] }) | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.push("/login");
      return;
    }
    getSupportTicket(token, params.id).then(setTicket);
  }, [router, params.id]);

  async function handleReply(e: React.FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token || !reply.trim()) return;
    setSending(true);
    try {
      const message = await addSupportMessage(token, params.id, reply);
      setTicket((prev) => (prev ? { ...prev, messages: [...prev.messages, message] } : prev));
      setReply("");
    } finally {
      setSending(false);
    }
  }

  if (!ticket) return <div className="mx-auto max-w-3xl px-6 py-20 text-ink/50">Loading…</div>;

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <Link href="/dashboard/support" className="text-sm text-acacia underline">
        ← All tickets
      </Link>
      <h1 className="mt-4 font-display text-2xl text-ink-horizon">{ticket.subject}</h1>
      <p className="mt-1 text-xs uppercase tracking-wide text-ink/40">Status: {ticket.status.replace("_", " ")}</p>

      <div className="mt-8 space-y-4">
        {ticket.messages.map((m) => (
          <div key={m.id} className="rounded-2xl bg-ink-horizon/5 p-4">
            <p className="text-sm text-ink/90">{m.body}</p>
            <p className="mt-2 text-xs text-ink/40">{new Date(m.createdAt).toLocaleString()}</p>
          </div>
        ))}
      </div>

      {ticket.status !== "closed" && (
        <form onSubmit={handleReply} className="mt-8 flex gap-3">
          <input
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder="Write a reply…"
            className="flex-1 rounded-lg border border-ink-horizon/20 bg-sand-light px-4 py-2.5 text-ink"
          />
          <button
            type="submit"
            disabled={sending}
            className="rounded-full bg-ink-horizon px-5 py-2.5 text-sm font-semibold text-sand-light hover:bg-acacia disabled:opacity-50"
          >
            Send
          </button>
        </form>
      )}
    </div>
  );
}
