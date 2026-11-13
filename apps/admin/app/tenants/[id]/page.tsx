"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  assignTenantPlan,
  downloadTenantExport,
  getTenant,
  archiveTenant,
  hardDeleteTenant,
  listPlans,
  listTenantUsers,
  reactivateTenant,
  suspendTenant,
  updateTenant,
  type AdminUser,
  type PlanInfo,
  type TenantWithStats,
} from "@/lib/api";
import { TenantBilling } from "@/components/related-lists";
import { getToken } from "@/lib/session";
import { setSelectedTenant } from "@/lib/tenant-session";
import { Btn, Card, Field, KV, Modal, Notice, PageHeader, Stat, StatusBadge, errMsg, inputCls } from "@/components/detail-ui";

export default function TenantDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [tenant, setTenant] = useState<TenantWithStats | null>(null);
  const [plans, setPlans] = useState<PlanInfo[]>([]);
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [planId, setPlanId] = useState("");

  const load = useCallback(() => {
    const token = getToken()!;
    getTenant(token, params.id)
      .then((t) => {
        setTenant(t);
        setPlanId(t.planId ?? "");
      })
      .catch((e) => setError(errMsg(e, "Could not load this tenant.")));
    listTenantUsers(token, params.id)
      .then(({ items }) => setUsers(items))
      .catch(() => setUsers([]));
  }, [params.id]);

  useEffect(() => {
    load();
    listPlans(getToken()!).then(setPlans).catch(() => setPlans([]));
  }, [load]);

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

  async function handleSuspend() {
    if (!tenant) return;
    const reason = window.prompt("Reason for suspending this tenant? (optional)");
    if (reason === null) return;
    await run(() => suspendTenant(getToken()!, tenant.id, reason || undefined), "Tenant suspended.");
  }

  async function handleArchive() {
    if (!tenant) return;
    if (!window.confirm(`Archive "${tenant.name}"? Its users are locked out and it leaves the active list, but nothing is deleted. You can restore it at any time.`)) return;
    const reason = window.prompt("Reason for archiving? (optional)");
    if (reason === null) return;
    await run(() => archiveTenant(getToken()!, tenant.id, reason || undefined), "Tenant archived. You can restore it from here.");
  }

  /** Irreversible; the API requires the tenant to be suspended and the slug typed back exactly. */
  async function handleHardDelete() {
    if (!tenant) return;
    const typed = window.prompt(
      `This permanently deletes "${tenant.name}" and everything in it: bookings, payments, users, all of it. It cannot be undone.\n\nType the tenant's slug (${tenant.slug}) to confirm:`
    );
    if (typed === null) return;
    setBusy(true);
    try {
      await hardDeleteTenant(getToken()!, tenant.id, typed);
      router.push("/tenants");
    } catch (e) {
      setError(errMsg(e, "Could not delete tenant."));
      setBusy(false);
    }
  }

  const back = (
    <Link href="/tenants" className="text-sm text-acacia underline">
      ← All tenants
    </Link>
  );

  if (!tenant) {
    return (
      <div className="p-3">
        {back}
        {error ? <Notice kind="error">{error}</Notice> : <p className="mt-6 text-ink/50">Loading…</p>}
      </div>
    );
  }

  const plan = plans.find((p) => p.id === tenant.planId);

  return (
    <div className="p-3">
      <PageHeader
        back={back}
        eyebrow="Tenant"
        title={tenant.name}
        badge={<StatusBadge value={tenant.status} />}
        actions={
          <>
            <Btn
              onClick={() => {
                setSelectedTenant({ id: tenant.id, name: tenant.name, slug: tenant.slug });
                router.push("/");
              }}
            >
              Manage this tenant
            </Btn>
            <Btn
              onClick={() => {
                setName(tenant.name);
                setEditing(true);
              }}
              disabled={busy}
            >
              Edit
            </Btn>
            <Btn onClick={() => run(() => downloadTenantExport(getToken()!, tenant.id, tenant.slug), "Export downloaded.")} disabled={busy}>
              Export data
            </Btn>
            {tenant.status === "suspended" || tenant.status === "cancelled" ? (
              <Btn tone="primary" onClick={() => run(() => reactivateTenant(getToken()!, tenant.id), tenant.status === "cancelled" ? "Tenant restored." : "Tenant reactivated.")} disabled={busy}>
                {tenant.status === "cancelled" ? "Restore" : "Reactivate"}
              </Btn>
            ) : (
              <>
                <Btn tone="dangerOutline" onClick={handleSuspend} disabled={busy}>
                  Suspend
                </Btn>
                <Btn tone="dangerOutline" onClick={handleArchive} disabled={busy}>
                  Archive
                </Btn>
              </>
            )}
          </>
        }
      />

      {message && <Notice kind="ok">{message}</Notice>}
      {error && <Notice kind="error">{error}</Notice>}
      {tenant.status === "cancelled" && <Notice kind="error">This tenant is archived{tenant.suspendedReason ? `: ${tenant.suspendedReason}` : ""}. Its users cannot sign in. Use Restore to bring it back.</Notice>}
      {tenant.status === "suspended" && tenant.suspendedReason && (
        <Notice kind="error">Suspended: {tenant.suspendedReason}</Notice>
      )}

      <div className="mt-6 grid gap-3 sm:grid-cols-4">
        <Stat label="Operators" value={tenant.activeOperators} />
        <Stat label="Destinations" value={tenant.activeDestinations} />
        <Stat label="Packages" value={tenant.activePackages} />
        <Stat label="Bookings" value={tenant.totalBookings} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card title="Details">
          <dl>
            <KV label="Slug">{tenant.slug}</KV>
            <KV label="Created">{new Date(tenant.createdAt).toLocaleDateString()}</KV>
            <KV label="Plan">{plan ? `${plan.name} ($${plan.monthlyPriceUsd}/mo)` : "None"}</KV>
            {tenant.suspendedAt && <KV label="Suspended on">{new Date(tenant.suspendedAt).toLocaleDateString()}</KV>}
          </dl>
          <div className="mt-4 flex items-end gap-2">
            <Field label="Assign plan">
              <select value={planId} onChange={(e) => setPlanId(e.target.value)} className={inputCls}>
                <option value="">No plan</option>
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} (${p.monthlyPriceUsd}/mo)
                  </option>
                ))}
              </select>
            </Field>
            <Btn tone="primary" disabled={busy || planId === (tenant.planId ?? "")} onClick={() => run(() => assignTenantPlan(getToken()!, tenant.id, planId || null), "Plan updated.")}>
              Save plan
            </Btn>
          </div>
        </Card>

        <Card title={`Users${users ? ` (${users.length})` : ""}`} actions={<Link href="/users" className="text-xs text-acacia underline">Manage all users</Link>}>
          {users === null ? (
            <p className="text-sm text-ink/50">Loading…</p>
          ) : users.length === 0 ? (
            <p className="text-sm text-ink/50">No users in this tenant.</p>
          ) : (
            <ul className="max-h-80 divide-y divide-ink-horizon/5 overflow-y-auto">
              {users.map((u) => (
                <li key={u.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <div>
                    <Link href={`/users/${u.id}`} className="text-ink-horizon underline-offset-2 hover:underline">
                      {u.firstName} {u.lastName}
                    </Link>
                    <p className="text-xs text-ink/50">{u.email}</p>
                  </div>
                  <StatusBadge value={u.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {(tenant.status === "suspended" || tenant.status === "cancelled") && (
        <div className="mt-6 rounded-xl border border-plum/30 bg-plum/5 p-5">
          <h2 className="font-display text-lg text-plum">Danger zone</h2>
          <p className="mt-1 text-sm text-ink/60">
            Permanently deletes this tenant and all its data. Unlike users and operators, this cannot be undone. Export the data first.
          </p>
          <Btn tone="danger" className="mt-3" onClick={handleHardDelete} disabled={busy}>
            Delete permanently
          </Btn>
        </div>
      )}

      <TenantBilling tenantId={tenant.id} />

      {editing && (
        <Modal title="Edit tenant" onClose={() => setEditing(false)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await run(() => updateTenant(getToken()!, tenant.id, { name: name.trim() }), "Tenant saved.");
              setEditing(false);
            }}
            className="space-y-3"
          >
            <Field label="Business name">
              <input required minLength={2} value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
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
