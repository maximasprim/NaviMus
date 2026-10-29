"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createTenant, listTenants, reactivateTenant, suspendTenant, downloadTenantExport, hardDeleteTenant, type Tenant } from "@/lib/api";
import { getToken, isLoggedIn } from "@/lib/session";
import { getSelectedTenant, setSelectedTenant, type SelectedTenant } from "@/lib/tenant-session";

const emptyForm = {
  name: "",
  slug: "",
  ownerEmail: "",
  ownerPassword: "",
  ownerFirstName: "",
  ownerLastName: "",
};

export default function TenantsPage() {
  const router = useRouter();
  const [loggedIn, setLoggedIn] = useState(true);
  const [tenants, setTenants] = useState<Tenant[] | null>(null);
  const [selected, setSelected] = useState<SelectedTenant | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  function load() {
    listTenants(getToken()!)
      .then(({ items }) => setTenants(items))
      .catch(() => setTenants([]));
  }

  useEffect(() => {
    if (!isLoggedIn()) {
      setLoggedIn(false);
      return;
    }
    setSelected(getSelectedTenant());
    load();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      const created = await createTenant(getToken()!, {
        name: form.name,
        slug: form.slug || undefined,
        ownerEmail: form.ownerEmail,
        ownerPassword: form.ownerPassword,
        ownerFirstName: form.ownerFirstName,
        ownerLastName: form.ownerLastName,
      });
      setTenants((prev) => (prev ? [created, ...prev] : [created]));
      setForm(emptyForm);
      setShowForm(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not create tenant.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSuspend(tenant: Tenant) {
    setActionId(tenant.id);
    setActionError(null);
    try {
      const reason = window.prompt("Reason for suspending this tenant? (optional)") ?? undefined;
      const updated = await suspendTenant(getToken()!, tenant.id, reason);
      setTenants((prev) => prev?.map((t) => (t.id === updated.id ? updated : t)) ?? null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not suspend tenant.");
    } finally {
      setActionId(null);
    }
  }

  async function handleReactivate(tenant: Tenant) {
    setActionId(tenant.id);
    setActionError(null);
    try {
      const updated = await reactivateTenant(getToken()!, tenant.id);
      setTenants((prev) => prev?.map((t) => (t.id === updated.id ? updated : t)) ?? null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not reactivate tenant.");
    } finally {
      setActionId(null);
    }
  }

  async function handleExport(tenant: Tenant) {
    setActionId(tenant.id);
    setActionError(null);
    try {
      await downloadTenantExport(getToken()!, tenant.id, tenant.slug);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not generate export.");
    } finally {
      setActionId(null);
    }
  }

  /** Irreversible - see TenantService.hardDelete's doc comment. Requires the tenant to already be suspended and the slug typed back exactly. */
  async function handleHardDelete(tenant: Tenant) {
    const typed = window.prompt(
      `This permanently deletes "${tenant.name}" and everything in it - bookings, payments, users, all of it. This cannot be undone.\n\nType the tenant's slug (${tenant.slug}) to confirm:`
    );
    if (typed === null) return;
    setActionId(tenant.id);
    setActionError(null);
    try {
      await hardDeleteTenant(getToken()!, tenant.id, typed);
      setTenants((prev) => prev?.filter((t) => t.id !== tenant.id) ?? null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not delete tenant.");
    } finally {
      setActionId(null);
    }
  }

  function handleManage(tenant: Tenant) {
    const next = { id: tenant.id, name: tenant.name, slug: tenant.slug };
    setSelectedTenant(next);
    setSelected(next);
    router.push("/");
  }

  if (!loggedIn) {
    return (
      <div className="p-3 text-ink/60">
        <Link href="/login" className="text-acacia underline">
          Sign in
        </Link>{" "}
        to manage tenants.
      </div>
    );
  }

  return (
    <div className="p-3">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-gold-deep">Platform</p>
          <h1 className="mt-2 font-display text-3xl text-ink-horizon">Tenants</h1>
          <p className="mt-2 max-w-2xl text-sm text-ink/60">
            Every business running on this platform. Creating a tenant also creates its first admin user -
            they can invite their own operators and staff from there.
          </p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded-full bg-acacia px-4 py-2 text-sm font-medium text-sand-light transition hover:bg-acacia/90"
        >
          {showForm ? "Cancel" : "New tenant"}
        </button>
      </div>

      {selected && (
        <p className="mt-4 rounded-lg bg-gold/10 px-4 py-2 text-sm text-ink-horizon">
          Currently managing <strong>{selected.name}</strong> ({selected.slug}) across the rest of this console.
        </p>
      )}

      {showForm && (
        <form onSubmit={handleCreate} className="mt-6 max-w-xl rounded-xl border border-ink-horizon/10 bg-white p-6">
          <h2 className="font-display text-lg text-ink-horizon">Create a new tenant</h2>
          {formError && <p className="mt-3 rounded-lg bg-plum/10 px-3 py-2 text-sm text-plum">{formError}</p>}
          <div className="mt-4 grid grid-cols-2 gap-3">
            <label className="col-span-2 text-xs text-ink/60">
              Business name
              <input
                required
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-ink-horizon/15 px-3 py-2 text-sm"
              />
            </label>
            <label className="col-span-2 text-xs text-ink/60">
              Slug (optional - derived from the name if left blank)
              <input
                value={form.slug}
                onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                placeholder="navimus-travels"
                className="mt-1 w-full rounded-lg border border-ink-horizon/15 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-xs text-ink/60">
              Owner first name
              <input
                required
                value={form.ownerFirstName}
                onChange={(e) => setForm((f) => ({ ...f, ownerFirstName: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-ink-horizon/15 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-xs text-ink/60">
              Owner last name
              <input
                required
                value={form.ownerLastName}
                onChange={(e) => setForm((f) => ({ ...f, ownerLastName: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-ink-horizon/15 px-3 py-2 text-sm"
              />
            </label>
            <label className="col-span-2 text-xs text-ink/60">
              Owner email
              <input
                required
                type="email"
                value={form.ownerEmail}
                onChange={(e) => setForm((f) => ({ ...f, ownerEmail: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-ink-horizon/15 px-3 py-2 text-sm"
              />
            </label>
            <label className="col-span-2 text-xs text-ink/60">
              Owner temporary password
              <input
                required
                type="password"
                value={form.ownerPassword}
                onChange={(e) => setForm((f) => ({ ...f, ownerPassword: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-ink-horizon/15 px-3 py-2 text-sm"
              />
            </label>
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="mt-5 rounded-full bg-acacia px-4 py-2 text-sm font-medium text-sand-light transition hover:bg-acacia/90 disabled:opacity-50"
          >
            {submitting ? "Creating…" : "Create tenant"}
          </button>
        </form>
      )}

      {actionError && <p className="mt-4 rounded-lg bg-plum/10 px-4 py-2 text-sm text-plum">{actionError}</p>}

      {tenants === null && <p className="mt-8 text-ink/50">Loading…</p>}

      {tenants && tenants.length === 0 && (
        <div className="mt-8 rounded-xl border border-dashed border-ink-horizon/20 p-10 text-center text-ink/50">
          No tenants yet - create the first one above.
        </div>
      )}

      {tenants && tenants.length > 0 && (
        <table className="mt-8 w-full border-collapse overflow-hidden rounded-xl border border-ink-horizon/10 bg-white text-sm">
          <thead>
            <tr className="border-b border-ink-horizon/10 bg-ink-horizon/[0.03] text-left">
              <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-[0.15em] text-ink/40">Name</th>
              <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-[0.15em] text-ink/40">Slug</th>
              <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-[0.15em] text-ink/40">Status</th>
              <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-[0.15em] text-ink/40">Created</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {tenants.map((t) => (
              <tr key={t.id} className="border-b border-ink-horizon/5 last:border-0">
                <td className="px-4 py-3 text-ink-horizon">{t.name}</td>
                <td className="px-4 py-3 font-mono text-xs text-ink/50">{t.slug}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-1 text-xs ${
                      t.status === "active" ? "bg-acacia/10 text-acacia" : "bg-plum/10 text-plum"
                    }`}
                  >
                    {t.status}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-ink/40">{new Date(t.createdAt).toLocaleDateString()}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => handleManage(t)}
                      className="rounded-full border border-ink-horizon/20 px-3 py-1.5 text-xs font-medium text-ink-horizon transition hover:bg-ink-horizon/5"
                    >
                      Manage
                    </button>
                    <button
                      onClick={() => handleExport(t)}
                      disabled={actionId === t.id}
                      className="rounded-full border border-ink-horizon/20 px-3 py-1.5 text-xs font-medium text-ink-horizon transition hover:bg-ink-horizon/5 disabled:opacity-50"
                    >
                      Export
                    </button>
                    {t.status === "suspended" ? (
                      <button
                        onClick={() => handleReactivate(t)}
                        disabled={actionId === t.id}
                        className="rounded-full bg-acacia px-3 py-1.5 text-xs font-medium text-sand-light transition hover:bg-acacia/90 disabled:opacity-50"
                      >
                        Reactivate
                      </button>
                    ) : (
                      <button
                        onClick={() => handleSuspend(t)}
                        disabled={actionId === t.id}
                        className="rounded-full border border-plum/30 px-3 py-1.5 text-xs font-medium text-plum transition hover:bg-plum/10 disabled:opacity-50"
                      >
                        Suspend
                      </button>
                    )}
                    {t.status === "suspended" && (
                      <button
                        onClick={() => handleHardDelete(t)}
                        disabled={actionId === t.id}
                        className="rounded-full bg-plum px-3 py-1.5 text-xs font-medium text-sand-light transition hover:bg-plum/90 disabled:opacity-50"
                      >
                        Delete permanently
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
