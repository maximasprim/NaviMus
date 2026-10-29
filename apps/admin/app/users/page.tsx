"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listUsers, setUserStatus, type AdminUser } from "@/lib/api";
import { getToken, isLoggedIn } from "@/lib/session";

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [search, setSearch] = useState("");
  const [loggedIn, setLoggedIn] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  function load() {
    if (!isLoggedIn()) {
      setLoggedIn(false);
      return;
    }
    listUsers(getToken()!, 1, 50, search || undefined)
      .then(({ items }) => setUsers(items))
      .catch(() => setUsers([]));
  }

  useEffect(load, [search]);

  async function handleToggleStatus(u: AdminUser) {
    setBusyId(u.id);
    try {
      const next = u.status === "active" ? "suspended" : "active";
      await setUserStatus(getToken()!, u.id, next);
      setUsers((prev) => prev?.map((x) => (x.id === u.id ? { ...x, status: next } : x)) ?? null);
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
        to manage users.
      </div>
    );
  }

  return (
    <div className="p-3">
      <p className="font-mono text-xs uppercase tracking-[0.3em] text-gold-deep">Operations</p>
      <h1 className="mt-2 font-display text-3xl text-ink-horizon">Users</h1>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by name or email…"
        className="mt-4 w-72 rounded-lg border border-ink-horizon/20 bg-white px-3 py-2 text-sm"
      />

      {users === null && <p className="mt-8 text-ink/50">Loading…</p>}

      {users && users.length > 0 && (
        <table className="mt-6 w-full text-left text-sm">
          <thead>
            <tr className="border-b border-ink-horizon/10 text-xs uppercase tracking-wide text-ink/40">
              <th className="pb-2">Name</th>
              <th className="pb-2">Email</th>
              <th className="pb-2">Status</th>
              <th className="pb-2">Verified</th>
              <th className="pb-2">Joined</th>
              <th className="pb-2" />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-ink-horizon/5">
                <td className="py-3">
                  {u.firstName} {u.lastName}
                </td>
                <td className="py-3 text-ink/60">{u.email}</td>
                <td className="py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      u.status === "active" ? "bg-acacia/10 text-acacia" : "bg-plum/10 text-plum"
                    }`}
                  >
                    {u.status}
                  </span>
                </td>
                <td className="py-3 text-ink/50">{u.emailVerifiedAt ? "Yes" : "No"}</td>
                <td className="py-3 text-ink/50">{new Date(u.createdAt).toLocaleDateString()}</td>
                <td className="py-3 text-right">
                  <button
                    onClick={() => handleToggleStatus(u)}
                    disabled={busyId === u.id}
                    className="text-xs text-acacia underline disabled:opacity-50"
                  >
                    {u.status === "active" ? "Suspend" : "Reactivate"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
