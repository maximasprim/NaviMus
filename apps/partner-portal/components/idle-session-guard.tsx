"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { logout } from "@/lib/api";
import { COOKIE_SESSION, hasSessionMarker } from "@/lib/session-core";

/** Sign out after this long without any activity. Override per deployment with NEXT_PUBLIC_IDLE_TIMEOUT_MINUTES. */
const IDLE_MS = (Number(process.env.NEXT_PUBLIC_IDLE_TIMEOUT_MINUTES) > 0 ? Number(process.env.NEXT_PUBLIC_IDLE_TIMEOUT_MINUTES) : 60) * 60_000;
const WARN_MS = Math.min(30_000, IDLE_MS / 2); // the countdown appears this long before signing out
const CHECK_MS = 1000; // once a second, so the countdown ticks smoothly
const HEARTBEAT_MS = 5 * 60_000; // while the person is active, quietly keep the session fresh
const ACTIVITY_KEY = "travel_last_activity";
const EVENTS = ["mousemove", "mousedown", "keydown", "wheel", "scroll", "touchstart", "click"] as const;

function readLast(): number {
  try {
    const v = Number(window.localStorage.getItem(ACTIVITY_KEY));
    return Number.isFinite(v) && v > 0 ? v : 0;
  } catch {
    return 0;
  }
}
function writeLast(t: number): void {
  try {
    window.localStorage.setItem(ACTIVITY_KEY, String(t));
  } catch {
    /* storage blocked: this tab still tracks itself in memory */
  }
}

/**
 * Signs the user out after an hour of no activity (mouse, keyboard, touch or scroll in ANY open tab) and returns
 * them to the login page. Shows a 30-second countdown first. While the person is active it quietly pings the API so
 * the session never lapses under them. The server enforces the same limit on staff sessions, so closing the tab
 * doesn't extend it either.
 */
export function IdleSessionGuard() {
  const memoryLast = useRef(Date.now());
  const lastHeartbeat = useRef(Date.now());
  const ending = useRef(false);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  const touch = useCallback(() => {
    const now = Date.now();
    memoryLast.current = now;
    if (now - readLast() > 3000) writeLast(now); // throttle storage writes
  }, []);

  const endSession = useCallback(async () => {
    if (ending.current) return;
    ending.current = true;
    await logout(); // revokes the session on the server and clears the local marker; never throws
    try {
      window.localStorage.removeItem(ACTIVITY_KEY);
    } catch {
      /* ignore */
    }
    window.location.assign("/login?expired=1&reason=idle");
  }, []);

  useEffect(() => {
    if (!hasSessionMarker()) return;
    // Coming back to a browser that was closed or left alone: if the last activity was over the limit ago, the
    // session is over - don't let simply opening the page start a fresh hour.
    const previous = readLast();
    if (previous > 0 && Date.now() - previous >= IDLE_MS) {
      void endSession();
      return;
    }
    touch(); // arriving on the page counts as activity
    const onActivity = () => touch();
    EVENTS.forEach((e) => window.addEventListener(e, onActivity, { passive: true, capture: true }));

    const check = () => {
      if (ending.current) return;
      const now = Date.now();
      const last = Math.max(readLast(), memoryLast.current);
      const idle = now - last;
      if (idle >= IDLE_MS) {
        void endSession();
        return;
      }
      setSecondsLeft(idle >= IDLE_MS - WARN_MS ? Math.max(0, Math.ceil((IDLE_MS - idle) / 1000)) : null);
      // Active recently: keep the session alive. (apiFetch renews the short-lived access token on its own when needed.)
      if (idle < HEARTBEAT_MS && now - lastHeartbeat.current >= HEARTBEAT_MS) {
        lastHeartbeat.current = now;
        apiFetch("/api/v1/auth/me", { token: COOKIE_SESSION }).catch(() => undefined);
      }
    };
    const timer = window.setInterval(check, CHECK_MS);
    const onWake = () => document.visibilityState === "visible" && check(); // a laptop coming back from sleep
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);
    return () => {
      window.clearInterval(timer);
      EVENTS.forEach((e) => window.removeEventListener(e, onActivity, { capture: true }));
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
    };
  }, [touch, endSession]);

  if (secondsLeft === null) return null;
  return (
    <div role="alertdialog" aria-live="assertive" className="fixed inset-x-0 bottom-6 z-50 mx-auto w-[min(92vw,26rem)] rounded-xl border border-ink-horizon/15 bg-white p-4 shadow-lg">
      <p className="text-sm font-medium text-ink-horizon">Still there?</p>
      <p className="mt-1 text-sm text-ink/60">
        You&apos;ll be signed out in {secondsLeft} second{secondsLeft === 1 ? "" : "s"} because there has been no activity.
      </p>
      <button
        type="button"
        onClick={() => {
          touch();
          setSecondsLeft(null);
        }}
        className="mt-3 rounded-full bg-acacia px-4 py-1.5 text-xs font-medium text-sand-light hover:bg-acacia/90"
      >
        Stay signed in
      </button>
    </div>
  );
}
