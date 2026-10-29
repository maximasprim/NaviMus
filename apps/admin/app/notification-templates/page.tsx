"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listNotificationTemplates, upsertNotificationTemplate, type NotificationTemplate } from "@/lib/api";
import { getToken, isLoggedIn } from "@/lib/session";

const CHANNELS = ["email", "sms", "whatsapp", "push", "in_app"];

export default function NotificationTemplatesPage() {
  const [templates, setTemplates] = useState<NotificationTemplate[] | null>(null);
  const [loggedIn, setLoggedIn] = useState(true);
  const [editing, setEditing] = useState<NotificationTemplate | null>(null);
  const [key, setKey] = useState("");
  const [channel, setChannel] = useState(CHANNELS[0]);
  const [subject, setSubject] = useState("");
  const [bodyTemplate, setBodyTemplate] = useState("");
  const [saving, setSaving] = useState(false);

  function load() {
    if (!isLoggedIn()) {
      setLoggedIn(false);
      return;
    }
    listNotificationTemplates(getToken()!)
      .then(setTemplates)
      .catch(() => setTemplates([]));
  }
  useEffect(load, []);

  function startEdit(t: NotificationTemplate | null) {
    setEditing(t);
    setKey(t?.key ?? "");
    setChannel(t?.channel ?? CHANNELS[0]);
    setSubject(t?.subject ?? "");
    setBodyTemplate(t?.bodyTemplate ?? "");
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await upsertNotificationTemplate(getToken()!, { key, channel, subject: subject || undefined, bodyTemplate });
      startEdit(null);
      load();
    } finally {
      setSaving(false);
    }
  }

  if (!loggedIn) {
    return (
      <div className="p-3 text-ink/60">
        <Link href="/login" className="text-acacia underline">
          Sign in
        </Link>{" "}
        to manage notification templates.
      </div>
    );
  }

  return (
    <div className="p-3">
      <p className="font-mono text-xs uppercase tracking-[0.3em] text-gold-deep">Communications</p>
      <h1 className="mt-2 font-display text-3xl text-ink-horizon">Notification templates</h1>
      <p className="mt-2 text-sm text-ink/60">
        Email/SMS/WhatsApp copy for every automated message - supports {"{{variable}}"} interpolation.
      </p>

      {templates === null && <p className="mt-8 text-ink/50">Loading…</p>}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div>
          <button
            onClick={() => startEdit(null)}
            className="mb-3 rounded-full bg-ink-horizon px-4 py-2 text-sm font-medium text-sand-light hover:bg-acacia"
          >
            + New template
          </button>
          <ul className="divide-y divide-ink-horizon/10">
            {templates?.map((t) => (
              <li key={t.id}>
                <button onClick={() => startEdit(t)} className="flex w-full items-center justify-between py-3 text-left text-sm hover:text-acacia">
                  <span className="font-mono">{t.key}</span>
                  <span className="text-xs uppercase text-ink/40">{t.channel}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <form onSubmit={handleSave} className="rounded-xl border border-ink-horizon/10 bg-white p-5">
          <input
            required
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="Event key, e.g. booking.confirmed"
            className="w-full rounded-lg border border-ink-horizon/20 px-3 py-2 text-sm font-mono"
          />
          <select value={channel} onChange={(e) => setChannel(e.target.value)} className="mt-2 rounded-lg border border-ink-horizon/20 px-3 py-2 text-sm">
            {CHANNELS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          {channel === "email" && (
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject line"
              className="mt-2 w-full rounded-lg border border-ink-horizon/20 px-3 py-2 text-sm"
            />
          )}
          <textarea
            required
            rows={8}
            value={bodyTemplate}
            onChange={(e) => setBodyTemplate(e.target.value)}
            placeholder="<p>Hi {{firstName}}, your booking is confirmed…</p>"
            className="mt-2 w-full rounded-lg border border-ink-horizon/20 px-3 py-2 font-mono text-xs"
          />
          <button
            type="submit"
            disabled={saving}
            className="mt-3 rounded-full bg-ink-horizon px-5 py-2 text-sm font-medium text-sand-light hover:bg-acacia disabled:opacity-50"
          >
            {saving ? "Saving…" : editing ? "Update template" : "Create template"}
          </button>
        </form>
      </div>
    </div>
  );
}
