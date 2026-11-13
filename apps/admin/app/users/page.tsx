"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createUser, deleteUser, listUsers, restoreUser, setUserStatus, type AdminUser } from "@/lib/api";
import { getToken, isLoggedIn } from "@/lib/session";
import { useAccess, useCan, useReadOnly } from "@/lib/access";
import { ACTIONS, ASSIGNABLE_ROLES } from "@/lib/access-rules";
import { Btn, Field, Modal, Notice, StatusBadge, errMsg, inputCls } from "@/components/detail-ui";

const emptyForm = { firstName: "", lastName: "", email: "", phone: "", password: "", role: "customer" };

export default function AdminUsersPage() {
  const canManage = useCan(ACTIONS.manageUsers);
  const readOnly = useReadOnly(ACTIONS.manageUsers);
  const { access } = useAccess();
  const isPlatform = access?.roles.includes("super_admin") ?? false;

  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [showDeleted, setShowDeleted] = useState(false);
  const [loggedIn, setLoggedIn] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!isLoggedIn()) {
      setLoggedIn(false);
      return;
    }
    listUsers(getToken()!, 1, 50, search || undefined, { status: status || undefined, deleted: showDeleted })
      .then(({ items }) => setUsers(items))
      .catch((e) => {
        setUsers([]);
        setError(errMsg(e, "Could not load users."));
      });
  }, [search, status, showDeleted]);

  useEffect(load, [load]);

  async function handleToggleStatus(u: AdminUser) {
    setBusyId(u.id);
    setError(null);
    try {
      const next = u.status === "active" ? "suspended" : "active";
      await setUserStatus(getToken()!, u.id, next);
      setUsers((prev) => prev?.map((x) => (x.id === u.id ? { ...x, status: next } : x)) ?? null);
    } catch (e) {
      setError(errMsg(e, "Could not change status."));
    } finally {
      setBusyId(null);
    }
  }

  async function handleRestore(u: AdminUser) {
    setBusyId(u.id);
    setError(null);
    try {
      await restoreUser(getToken()!, u.id);
      setUsers((prev) => prev?.filter((x) => x.id !== u.id) ?? null);
    } catch (e) {
      setError(errMsg(e, "Could not restore user."));
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(u: AdminUser) {
    if (!window.confirm(`Delete ${u.firstName} ${u.lastName} (${u.email})? They will no longer be able to sign in. Their bookings and history are kept.`)) return;
    setBusyId(u.id);
    setError(null);
    try {
      await deleteUser(getToken()!, u.id);
      setUsers((prev) => prev?.filter((x) => x.id !== u.id) ?? null);
    } catch (e) {
      setError(errMsg(e, "Could not delete user."));
    } finally {
      setBusyId(null);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      await createUser(getToken()!, {
        email: form.email.trim(),
        password: form.password,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        phone: form.phone.trim() || undefined,
        role: form.role,
      });
      setCreating(false);
      setForm(emptyForm);
      load();
    } catch (err) {
      setFormError(errMsg(err, "Could not create user."));
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
        to manage users.
      </div>
    );
  }

  const roles = isPlatform ? ["super_admin", ...ASSIGNABLE_ROLES] : [...ASSIGNABLE_ROLES];

  return (
    <div className="p-3">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-gold-deep">Operations</p>
          <h1 className="mt-2 font-display text-3xl text-ink-horizon">Users</h1>
        </div>
        {canManage && (
          <Btn tone="primary" onClick={() => setCreating(true)}>
            New user
          </Btn>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or email…"
          className="w-72 rounded-lg border border-ink-horizon/20 bg-white px-3 py-2 text-sm"
        />
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-lg border border-ink-horizon/20 bg-white px-3 py-2 text-sm">
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="deactivated">Deactivated</option>
        </select>
        <label className="flex items-center gap-2 text-sm text-ink/60">
          <input type="checkbox" checked={showDeleted} onChange={(e) => setShowDeleted(e.target.checked)} />
          Show deleted
        </label>
      </div>

      {readOnly && <Notice kind="ok">View only: creating, editing and deleting users is done by an administrator.</Notice>}
      {error && <Notice kind="error">{error}</Notice>}
      {users === null && <p className="mt-8 text-ink/50">Loading…</p>}
      {users && users.length === 0 && !error && (
        <div className="mt-8 rounded-xl border border-dashed border-ink-horizon/20 p-10 text-center text-ink/50">{showDeleted ? "No deleted users." : "No users match."}</div>
      )}

      {users && users.length > 0 && (
        <table className="mt-6 w-full text-left text-sm">
          <thead>
            <tr className="border-b border-ink-horizon/10 text-xs uppercase tracking-wide text-ink/40">
              <th className="pb-2">Name</th>
              <th className="pb-2">Email</th>
              {isPlatform && <th className="pb-2">Tenant</th>}
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
                  <Link href={`/users/${u.id}`} className="text-ink-horizon underline-offset-2 hover:underline">
                    {u.firstName} {u.lastName}
                  </Link>
                </td>
                <td className="py-3 text-ink/60">{u.email}</td>
                {isPlatform && <td className="py-3 text-ink/50">{u.tenantName ?? "-"}</td>}
                <td className="py-3">
                  <StatusBadge value={u.status} />
                </td>
                <td className="py-3 text-ink/50">{u.emailVerifiedAt ? "Yes" : "No"}</td>
                <td className="py-3 text-ink/50">{new Date(u.createdAt).toLocaleDateString()}</td>
                <td className="py-3">
                  <div className="flex justify-end gap-2">
                    {!showDeleted && (
                      <Link href={`/users/${u.id}`} className="rounded-full border border-ink-horizon/20 px-3.5 py-1.5 text-xs font-medium text-ink-horizon hover:bg-ink-horizon/5">
                        View
                      </Link>
                    )}
                    {canManage && showDeleted && (
                      <Btn tone="primary" onClick={() => handleRestore(u)} disabled={busyId === u.id}>
                        Restore
                      </Btn>
                    )}
                    {canManage && !showDeleted && (
                      <>
                        <Btn onClick={() => handleToggleStatus(u)} disabled={busyId === u.id}>
                          {u.status === "active" ? "Suspend" : "Reactivate"}
                        </Btn>
                        <Btn tone="dangerOutline" onClick={() => handleDelete(u)} disabled={busyId === u.id}>
                          Delete
                        </Btn>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {creating && (
        <Modal title="New user" onClose={() => setCreating(false)}>
          <form onSubmit={handleCreate} className="space-y-3">
            {formError && <Notice kind="error">{formError}</Notice>}
            <div className="grid grid-cols-2 gap-3">
              <Field label="First name">
                <input required value={form.firstName} onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))} className={inputCls} />
              </Field>
              <Field label="Last name">
                <input required value={form.lastName} onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))} className={inputCls} />
              </Field>
            </div>
            <Field label="Email">
              <input required type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className={inputCls} />
            </Field>
            <Field label="Phone (optional)">
              <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} className={inputCls} />
            </Field>
            <Field label="Temporary password">
              <input required type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} className={inputCls} />
            </Field>
            <Field label="Role">
              <select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))} className={inputCls}>
                {roles.map((r) => (
                  <option key={r} value={r}>
                    {r.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <Btn type="button" onClick={() => setCreating(false)}>
                Cancel
              </Btn>
              <Btn type="submit" tone="primary" disabled={saving}>
                {saving ? "Creating…" : "Create user"}
              </Btn>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
