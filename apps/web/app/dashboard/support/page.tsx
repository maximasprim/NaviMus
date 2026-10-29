"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getToken } from "@/lib/session";
import { listMySupportTickets, createSupportTicket, type SupportTicket } from "@/lib/api";
import { ApiError } from "@/lib/api-client";

const STATUS_LABELS: Record<SupportTicket["status"], string> = {
  open: "Open",
  in_progress: "In progress",
  resolved: "Resolved",
  closed: "Closed",
};

export default function SupportPage() {
  const router = useRouter();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.push("/login");
      return;
    }
    listMySupportTickets(token)
      .then(setTickets)
      .finally(() => setLoading(false));
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token) return;
    setError(null);
    setSubmitting(true);
    try {
      const ticket = await createSupportTicket(token, { subject, message });
      setTickets((prev) => [ticket, ...prev]);
      setShowForm(false);
      setSubject("");
      setMessage("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't open that ticket - try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <Link href="/dashboard" className="text-sm text-acacia underline">
        ← Back to account
      </Link>
      <div className="mt-4 flex items-center justify-between">
        <h1 className="font-display text-3xl text-ink-horizon">Support</h1>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="rounded-full bg-ink-horizon px-4 py-2 text-sm font-medium text-sand-light hover:bg-acacia"
        >
          {showForm ? "Cancel" : "New ticket"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="mt-6 space-y-4 rounded-2xl border border-ink-horizon/15 p-6">
          <div>
            <label htmlFor="subject" className="block text-sm font-medium text-ink/80">
              Subject
            </label>
            <input
              id="subject"
              required
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="mt-1 w-full rounded-lg border border-ink-horizon/20 bg-sand-light px-4 py-2.5 text-ink"
            />
          </div>
          <div>
            <label htmlFor="message" className="block text-sm font-medium text-ink/80">
              How can we help?
            </label>
            <textarea
              id="message"
              required
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="mt-1 w-full rounded-lg border border-ink-horizon/20 bg-sand-light px-4 py-2.5 text-ink"
            />
          </div>
          {error && <p className="text-sm text-plum">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="rounded-full bg-ink-horizon px-6 py-2.5 text-sm font-semibold text-sand-light hover:bg-acacia disabled:opacity-50"
          >
            {submitting ? "Sending…" : "Submit"}
          </button>
        </form>
      )}

      {loading && <p className="mt-8 text-ink/50">Loading…</p>}
      {!loading && tickets.length === 0 && !showForm && <p className="mt-8 text-ink/50">No support tickets yet.</p>}

      <ul className="mt-6 divide-y divide-ink-horizon/10">
        {tickets.map((t) => (
          <li key={t.id}>
            <Link href={`/dashboard/support/${t.id}`} className="flex items-center justify-between py-4 hover:text-acacia">
              <div>
                <p className="font-medium text-ink-horizon">{t.subject}</p>
                <p className="mt-0.5 text-xs text-ink/50">Opened {new Date(t.createdAt).toLocaleDateString()}</p>
              </div>
              <span className="rounded-full bg-ink-horizon/5 px-3 py-1 text-xs font-medium text-ink/70">
                {STATUS_LABELS[t.status]}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
