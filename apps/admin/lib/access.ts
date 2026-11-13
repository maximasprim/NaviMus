"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "./api-client";
import { getToken, isLoggedIn } from "./session";

/**
 * What the signed-in person is allowed to do, so the console can show each role only the menus
 * it can actually use. This is for DISPLAY only: the API still enforces every role on every call,
 * so hiding a menu never replaces (or weakens) that check.
 *
 * Source of truth is GET /api/v1/auth/me (roles + permissions from the verified token). A copy is
 * cached in localStorage so the menu appears instantly after sign-in and on reload; it is refreshed
 * from the server every time the sidebar mounts, and cleared on sign-out.
 */
export interface Access {
  roles: string[];
  permissions: string[];
}

/** A menu item is shown if the person holds ANY listed role OR ANY listed permission. super_admin sees everything. */
export interface AccessRule {
  roles?: string[];
  permissions?: string[];
}

const KEY = "travel_admin_access";

export function saveAccess(access: Access): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(KEY, JSON.stringify(access)); } catch { /* storage unavailable */ }
}

export function readAccess(): Access | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<Access>;
    if (!Array.isArray(v.roles)) return null;
    return { roles: v.roles, permissions: Array.isArray(v.permissions) ? v.permissions : [] };
  } catch {
    return null;
  }
}

export function clearAccess(): void {
  memo = null;
  if (typeof window === "undefined") return;
  try { window.localStorage.removeItem(KEY); } catch { /* storage unavailable */ }
}

// Many components on one page (sidebar, tenant box, route guard, page buttons) all ask "who am I?". They share one
// in-flight request and one short-lived answer instead of each calling the server.
const FRESH_MS = 30_000;
let memo: { at: number; value: Access } | null = null;
let inflight: Promise<Access | null> | null = null;

/** Asks the server who this is. Returns null if it can't be determined (callers then keep what they have). */
export function refreshAccess(): Promise<Access | null> {
  if (memo && Date.now() - memo.at < FRESH_MS) return Promise.resolve(memo.value);
  if (inflight) return inflight;
  inflight = fetchAccess().finally(() => {
    inflight = null;
  });
  return inflight;
}

async function fetchAccess(): Promise<Access | null> {
  try {
    const { data } = await apiFetch<{ roles?: string[]; permissions?: string[] } | null>("/api/v1/auth/me", {
      token: getToken() ?? undefined,
    });
    if (!data || !Array.isArray(data.roles)) return null;
    const access: Access = { roles: data.roles, permissions: Array.isArray(data.permissions) ? data.permissions : [] };
    saveAccess(access);
    memo = { at: Date.now(), value: access };
    return access;
  } catch {
    return null;
  }
}

/**
 * Whether `access` satisfies `rule`. Unknown access (null) is treated as allowed: that is the console's
 * behaviour before roles existed, and the API refuses anything the person truly can't do.
 */
export function can(access: Access | null, rule?: AccessRule): boolean {
  if (!rule || !access) return true;
  if (access.roles.includes("super_admin")) return true;
  if (rule.roles?.some((r) => access.roles.includes(r))) return true;
  if (rule.permissions?.some((p) => access.permissions.includes(p))) return true;
  return false;
}

/** Each role's natural starting page, in priority order (first matching role wins). */
const ROLE_HOME: [role: string, href: string][] = [
  ["super_admin", "/tenants"],
  ["admin", "/"],
  ["travel_manager", "/operators"],
  ["destination_manager", "/approvals"],
  ["finance_manager", "/bookings"],
  ["customer_support", "/support"],
  ["marketing_manager", "/notification-templates"],
];

export function homeFor(roles: string[]): string {
  return ROLE_HOME.find(([role]) => roles.includes(role))?.[1] ?? "/";
}

/**
 * Access for the current session. `ready` becomes true once it's known (cache read, then confirmed with the
 * server); until then render nothing role-specific so the wrong menu never flashes.
 */
export function useAccess(): { access: Access | null; ready: boolean } {
  const [access, setAccess] = useState<Access | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const cached = readAccess();
    if (cached) {
      setAccess(cached);
      setReady(true);
    }
    if (!isLoggedIn()) {
      setReady(true);
      return;
    }
    refreshAccess().then((fresh) => {
      if (cancelled) return;
      if (fresh) setAccess(fresh);
      setReady(true); // if the server couldn't say, keep the cache (or null = show everything, as before)
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { access, ready };
}

/**
 * Whether the signed-in person may perform an action (show its button). Hidden until we know who they are, so a
 * button they can't use never flashes up; if the server can't say, it is shown (the API still refuses).
 */
export function useCan(rule: AccessRule): boolean {
  const { access, ready } = useAccess();
  return ready && can(access, rule);
}

/** True only once we KNOW the person lacks this permission (for "view only" notices that must not flash for admins while loading). */
export function useReadOnly(rule: AccessRule): boolean {
  const { access, ready } = useAccess();
  return ready && access !== null && !can(access, rule);
}
