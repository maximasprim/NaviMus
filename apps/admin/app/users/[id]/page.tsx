"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { deleteUser, getUserDetail, setUserRole, setUserStatus, updateUser, type AdminUserDetail } from "@/lib/api";
import { getToken } from "@/lib/session";
import { useAccess, useCan } from "@/lib/access";
import { ACTIONS, ASSIGNABLE_ROLES } from "@/lib/access-rules";
import { HistoryCard } from "@/components/history-card";
import { UserRelated, UserTickets } from "@/components/related-lists";
import { Btn, Card, Field, KV, Modal, Notice, PageHeader, Stat, StatusBadge, errMsg, inputCls } from "@/components/detail-ui";

export default function UserDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const canManage = useCan(ACTIONS.manageUsers);
  const { access } = useAccess();
  const isPlatform = access?.roles.includes("super_admin") ?? false;

  const [user, setUser] = useState<AdminUserDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", phone: "" });
  const [role, setRole] = useState("");

  const load = useCallback(() => {
    getUserDetail(getToken()!, params.id)
      .then((u) => {
        setUser(u);
        setRole(u.roles[0] ?? "customer");
      })
      .catch((e) => setError(errMsg(e, "Could not load this user.")));
  }, [params.id]);

  useEffect(load, [load]);

  async function run(fn: () => Promise<unknown>, done: string) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await fn();
      setMessage(done);
      load();
    } catch (e) {
      setError(errMsg(e, "That didn't work."));
    } finally {
      setBusy(false);
    }
  }

  function openEdit() {
    if (!user) return;
    setForm({ firstName: user.firstName, lastName: user.lastName, email: user.email, phone: user.phone ?? "" });
    setEditing(true);
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    await run(
      () =>
        updateUser(getToken()!, user.id, {
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          email: form.email.trim(),
          phone: form.phone.trim() || null,
        }),
      "Profile saved."
    );
    setEditing(false);
  }

  async function handleDelete() {
    if (!user) return;
    if (!window.confirm(`Delete ${user.firstName} ${user.lastName}? They will no longer be able to sign in. Their bookings and history are kept.`)) return;
    setBusy(true);
    try {
      await deleteUser(getToken()!, user.id);
      router.push("/users");
    } catch (e) {
      setError(errMsg(e, "Could not delete user."));
      setBusy(false);
    }
  }

  const back = (
    <Link href="/users" className="text-sm text-acacia underline">
      ← All users
    </Link>
  );

  if (!user) {
    return (
      <div className="p-3">
        {back}
        {error ? <Notice kind="error">{error}</Notice> : <p className="mt-6 text-ink/50">Loading…</p>}
      </div>
    );
  }

  const roleOptions = isPlatform ? ["super_admin", ...ASSIGNABLE_ROLES] : [...ASSIGNABLE_ROLES];

  return (
    <div className="p-3">
      <PageHeader
        back={back}
        eyebrow="User"
        title={`${user.firstName} ${user.lastName}`}
        badge={<StatusBadge value={user.status} />}
        actions={
          canManage && (
            <>
              <Btn onClick={openEdit} disabled={busy}>
                Edit
              </Btn>
              <Btn
                onClick={() => run(() => setUserStatus(getToken()!, user.id, user.status === "active" ? "suspended" : "active"), "Status updated.")}
                disabled={busy}
              >
                {user.status === "active" ? "Suspend" : "Reactivate"}
              </Btn>
              <Btn tone="dangerOutline" onClick={handleDelete} disabled={busy}>
                Delete
              </Btn>
            </>
          )
        }
      />

      {message && <Notice kind="ok">{message}</Notice>}
      {error && <Notice kind="error">{error}</Notice>}

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Stat label="Bookings" value={user.bookingCount} />
        <Stat label="Last booking" value={user.lastBookingAt ? new Date(user.lastBookingAt).toLocaleDateString() : "-"} />
        <Stat label="Email verified" value={user.emailVerifiedAt ? "Yes" : "No"} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card title="Profile">
          <dl>
            <KV label="Email">{user.email}</KV>
            <KV label="Phone">{user.phone}</KV>
            <KV label="Nationality">{user.nationality}</KV>
            <KV label="Two-factor">{user.mfaEnabled ? "On" : "Off"}</KV>
            <KV label="Joined">{new Date(user.createdAt).toLocaleString()}</KV>
            <KV label="Last updated">{new Date(user.updatedAt).toLocaleString()}</KV>
            <KV label="Tenant">{user.tenant ? `${user.tenant.name} (${user.tenant.slug})` : "-"}</KV>
          </dl>
        </Card>

        <Card title="Role & access">
          <p className="text-sm text-ink/60">
            Current: {user.roles.length ? user.roles.map((r) => r.replace(/_/g, " ")).join(", ") : "none"}
          </p>
          {canManage ? (
            <div className="mt-3 flex items-end gap-2">
              <Field label="Change role">
                <select value={role} onChange={(e) => setRole(e.target.value)} className={inputCls}>
                  {roleOptions.map((r) => (
                    <option key={r} value={r}>
                      {r.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
              </Field>
              <Btn tone="primary" disabled={busy || role === user.roles[0]} onClick={() => run(() => setUserRole(getToken()!, user.id, role), "Role updated. It applies the next time they sign in.")}>
                Save role
              </Btn>
            </div>
          ) : (
            <p className="mt-3 text-xs text-ink/40">Only an administrator can change roles.</p>
          )}
        </Card>

        {user.operator && (
          <Card title="Operator account">
            <dl>
              <KV label="Business">
                <Link href={`/operators/${user.operator.id}`} className="text-acacia underline">
                  {user.operator.businessName}
                </Link>
              </KV>
              <KV label="Title">{user.operator.title}</KV>
              <KV label="Status">
                <StatusBadge value={user.operator.status} />
              </KV>
            </dl>
          </Card>
        )}
      </div>

      <UserRelated userId={user.id} />
      <UserTickets userId={user.id} />
      <HistoryCard resourceType="user" resourceId={user.id} />

      {editing && (
        <Modal title="Edit user" onClose={() => setEditing(false)}>
          <form onSubmit={saveEdit} className="space-y-3">
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
            <Field label="Phone">
              <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} className={inputCls} />
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <Btn type="button" onClick={() => setEditing(false)}>
                Cancel
              </Btn>
              <Btn type="submit" tone="primary" disabled={busy}>
                Save
              </Btn>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
