"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getToken } from "@/lib/session";
import { listMyNotifications, markNotificationRead, markAllNotificationsRead, type AppNotification } from "@/lib/api";

const TEMPLATE_LABELS: Record<string, string> = {
  "booking.created": "Booking received",
  "payment.completed": "Payment confirmed",
  "payment.failed": "Payment issue",
  "booking.cancelled": "Booking cancelled",
  "refund.completed": "Refund processed",
  "trip.reminder": "Upcoming trip",
  "booking.confirmed": "Booking confirmed",
};

export default function NotificationsPage() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const token = getToken();
    if (!token) {
      router.push("/login");
      return;
    }
    const { items, meta } = await listMyNotifications(token);
    setNotifications(items);
    setUnreadCount((meta?.unreadCount as number) ?? 0);
    setLoading(false);
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleMarkRead(id: string) {
    const token = getToken();
    if (!token) return;
    await markNotificationRead(token, id);
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)));
    setUnreadCount((c) => Math.max(0, c - 1));
  }

  async function handleMarkAllRead() {
    const token = getToken();
    if (!token) return;
    await markAllNotificationsRead(token);
    setNotifications((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
    setUnreadCount(0);
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <Link href="/dashboard" className="text-sm text-acacia underline">
        ← Back to account
      </Link>

      <div className="mt-4 flex items-center justify-between">
        <h1 className="font-display text-3xl text-ink-horizon">Notifications</h1>
        {unreadCount > 0 && (
          <button onClick={handleMarkAllRead} className="text-sm text-acacia underline">
            Mark all as read
          </button>
        )}
      </div>

      {loading && <p className="mt-8 text-ink/50">Loading…</p>}

      {!loading && notifications.length === 0 && (
        <p className="mt-8 text-ink/50">Nothing here yet - booking and trip updates will show up in this list.</p>
      )}

      <ul className="mt-6 divide-y divide-ink-horizon/10">
        {notifications.map((n) => (
          <li
            key={n.id}
            className={`flex items-start justify-between gap-4 py-4 ${n.readAt ? "" : "bg-gold/5"}`}
          >
            <div>
              <p className="font-medium text-ink-horizon">{TEMPLATE_LABELS[n.templateKey] ?? n.templateKey}</p>
              <p className="mt-0.5 text-xs uppercase tracking-wide text-ink/40">
                {n.channel} · {new Date(n.createdAt).toLocaleString()}
              </p>
            </div>
            {!n.readAt && (
              <button onClick={() => handleMarkRead(n.id)} className="shrink-0 text-xs text-acacia underline">
                Mark read
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
