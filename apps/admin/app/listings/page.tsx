"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  deleteListing,
  getListing,
  listListings,
  restoreListing,
  updateListing,
  type ListingDetail,
  type ListingKind,
  type ListingRow,
  type ListingStatus,
} from "@/lib/api";
import { getToken } from "@/lib/session";
import { useAccess, can } from "@/lib/access";
import { ACTIONS } from "@/lib/access-rules";
import { Btn, Field, Modal, Notice, StatusBadge, errMsg, inputCls } from "@/components/detail-ui";

const KINDS: { kind: ListingKind; label: string }[] = [
  { kind: "destination", label: "Destinations" },
  { kind: "package", label: "Packages" },
  { kind: "accommodation", label: "Accommodation" },
  { kind: "transport", label: "Transport" },
];
const HAS_STATUS: Record<ListingKind, boolean> = { destination: true, package: true, accommodation: true, transport: false };
const HAS_FEATURED: Record<ListingKind, boolean> = { destination: true, package: true, accommodation: false, transport: false };
const HAS_SHORT: Record<ListingKind, boolean> = { destination: true, package: true, accommodation: false, transport: false };
const HAS_DESCRIPTION: Record<ListingKind, boolean> = { destination: true, package: true, accommodation: true, transport: false };
const SHOWS_OPERATOR: Record<ListingKind, boolean> = { destination: false, package: true, accommodation: true, transport: true };

const STATUSES: ListingStatus[] = ["draft", "pending_review", "published", "rejected", "archived"];

export default function ListingsPage() {
  const { access, ready } = useAccess();
  const canDest = ready && can(access, ACTIONS.editDestinations);
  const canPkg = ready && can(access, ACTIONS.editPackages); // packages, accommodation and transport share the same roles
  const allowed = (k: ListingKind) => (k === "destination" ? canDest : canPkg);
  const [showDeleted, setShowDeleted] = useState(false);
  const [kind, setKind] = useState<ListingKind>("destination");
  const [rows, setRows] = useState<ListingRow[] | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<ListingDetail | null>(null);
  const [saving, setSaving] = useState(false);

  // Start on a tab this role can actually use.
  useEffect(() => {
    if (!ready || allowed(kind)) return;
    const first = KINDS.find((k) => allowed(k.kind));
    if (first) setKind(first.kind);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, canDest, canPkg, kind]);

  const canEdit = allowed(kind);

  const load = useCallback(() => {
    setRows(null);
    setError(null);
    listListings(getToken()!, kind, { search: search || undefined, status: status || undefined, pageSize: 50, deleted: showDeleted })
      .then(({ items }) => setRows(items))
      .catch((e) => {
        setRows([]);
        setError(errMsg(e, "Could not load listings."));
      });
  }, [kind, search, status, showDeleted]);

  useEffect(() => {
    if (ready) load();
  }, [ready, load]);

  async function openEdit(r: ListingRow) {
    setError(null);
    try {
      setEditing(await getListing(getToken()!, kind, r.id));
    } catch (e) {
      setError(errMsg(e, "Could not open this listing."));
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setSaving(true);
    setError(null);
    try {
      await updateListing(getToken()!, kind, editing.id, {
        name: editing.name.trim(),
        ...(HAS_SHORT[kind] ? { shortDescription: editing.shortDescription?.trim() || null } : {}),
        ...(HAS_DESCRIPTION[kind] ? { description: editing.description?.trim() || null } : {}),
        ...(HAS_STATUS[kind] ? { status: editing.status } : {}),
        ...(HAS_FEATURED[kind] ? { featured: editing.featured } : {}),
        ...(kind === "transport" ? { contactPhone: editing.contactPhone?.trim() || null } : {}),
      });
      setEditing(null);
      setMessage("Saved.");
      load();
    } catch (err) {
      setError(errMsg(err, "Could not save."));
    } finally {
      setSaving(false);
    }
  }

  async function restore(r: ListingRow) {
    setBusyId(r.id);
    setError(null);
    try {
      await restoreListing(getToken()!, kind, r.id);
      setRows((prev) => prev?.filter((x) => x.id !== r.id) ?? null);
      setMessage(HAS_STATUS[kind] ? "Restored as a draft. Review it, then publish." : "Restored.");
    } catch (e) {
      setError(errMsg(e, "Could not restore."));
    } finally {
      setBusyId(null);
    }
  }

  async function remove(r: ListingRow) {
    if (!window.confirm(`Delete "${r.name}"? It is archived and disappears from the site. Existing bookings are kept.`)) return;
    setBusyId(r.id);
    setError(null);
    try {
      await deleteListing(getToken()!, kind, r.id);
      setRows((prev) => prev?.filter((x) => x.id !== r.id) ?? null);
      setMessage("Deleted.");
    } catch (e) {
      setError(errMsg(e, "Could not delete."));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="p-3">
      <p className="font-mono text-xs uppercase tracking-[0.3em] text-gold-deep">Platform</p>
      <h1 className="mt-2 font-display text-3xl text-ink-horizon">Listings</h1>
      <p className="mt-2 max-w-2xl text-sm text-ink/60">Destinations, packages, accommodation and transport providers in every status. Edit, remove, or restore what was removed.</p>

      <div role="tablist" className="mt-6 flex gap-1 border-b border-ink-horizon/10">
        {KINDS.map(({ kind: k, label }) => {
          if (ready && !allowed(k)) return null;
          const active = k === kind;
          return (
            <button
              key={k}
              role="tab"
              aria-selected={active}
              onClick={() => {
                setKind(k);
                setStatus("");
              }}
              className={`-mb-px border-b-2 px-4 py-2 text-sm transition-colors ${active ? "border-gold font-medium text-ink-horizon" : "border-transparent text-ink/50 hover:text-ink-horizon"}`}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name…" className="w-72 rounded-lg border border-ink-horizon/20 bg-white px-3 py-2 text-sm" />
        {HAS_STATUS[kind] && (
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-lg border border-ink-horizon/20 bg-white px-3 py-2 text-sm">
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        )}
        <label className="flex items-center gap-2 text-sm text-ink/60">
          <input type="checkbox" checked={showDeleted} onChange={(e) => setShowDeleted(e.target.checked)} />
          Show deleted
        </label>
      </div>

      {message && <Notice kind="ok">{message}</Notice>}
      {error && <Notice kind="error">{error}</Notice>}
      {rows === null && <p className="mt-8 text-ink/50">Loading…</p>}
      {rows && rows.length === 0 && !error && (
        <div className="mt-8 rounded-xl border border-dashed border-ink-horizon/20 p-10 text-center text-ink/50">{showDeleted ? "Nothing deleted." : "Nothing here yet."}</div>
      )}

      {rows && rows.length > 0 && (
        <table className="mt-6 w-full border-collapse overflow-hidden rounded-xl border border-ink-horizon/10 bg-white text-sm">
          <thead>
            <tr className="border-b border-ink-horizon/10 bg-ink-horizon/[0.03] text-left">
              <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-[0.15em] text-ink/40">Name</th>
              {SHOWS_OPERATOR[kind] && <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-[0.15em] text-ink/40">Operator</th>}
              {HAS_STATUS[kind] && <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-[0.15em] text-ink/40">Status</th>}
              {HAS_FEATURED[kind] && <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-[0.15em] text-ink/40">Featured</th>}
              <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-[0.15em] text-ink/40">Created</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-ink-horizon/5 last:border-0">
                <td className="px-4 py-3 text-ink-horizon">
                  {r.name}
                  <p className="font-mono text-[11px] text-ink/40">{r.slug}</p>
                </td>
                {SHOWS_OPERATOR[kind] && <td className="px-4 py-3 text-ink/60">{r.operatorName ?? "-"}</td>}
                {HAS_STATUS[kind] && (
                  <td className="px-4 py-3">
                    <StatusBadge value={r.status} />
                  </td>
                )}
                {HAS_FEATURED[kind] && <td className="px-4 py-3 text-ink/50">{r.featured ? "Yes" : "No"}</td>}
                <td className="px-4 py-3 font-mono text-xs text-ink/40">{new Date(r.createdAt).toLocaleDateString()}</td>
                <td className="px-4 py-3">
                  {canEdit && showDeleted && (
                    <div className="flex justify-end">
                      <Btn tone="primary" onClick={() => restore(r)} disabled={busyId === r.id}>
                        Restore
                      </Btn>
                    </div>
                  )}
                  {canEdit && !showDeleted && (
                    <div className="flex justify-end gap-2">
                      <Link href={`/listings/${kind}/${r.id}`} className="rounded-full border border-ink-horizon/20 px-3.5 py-1.5 text-xs font-medium text-ink-horizon hover:bg-ink-horizon/5">
                        Open
                      </Link>
                      <Btn tone="dangerOutline" onClick={() => remove(r)} disabled={busyId === r.id}>
                        Delete
                      </Btn>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {editing && (
        <Modal title={`Edit ${KINDS.find((k) => k.kind === kind)?.label.toLowerCase()}`} onClose={() => setEditing(null)}>
          <form onSubmit={save} className="space-y-3">
            <Field label="Name">
              <input required minLength={2} value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className={inputCls} />
            </Field>
            {HAS_SHORT[kind] && (
              <Field label="Short description">
                <input maxLength={500} value={editing.shortDescription ?? ""} onChange={(e) => setEditing({ ...editing, shortDescription: e.target.value })} className={inputCls} />
              </Field>
            )}
            {HAS_DESCRIPTION[kind] && (
              <Field label="Description">
                <textarea rows={5} value={editing.description ?? ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} className={inputCls} />
              </Field>
            )}
            {kind === "transport" && (
              <Field label="Contact phone">
                <input maxLength={32} value={editing.contactPhone ?? ""} onChange={(e) => setEditing({ ...editing, contactPhone: e.target.value })} className={inputCls} />
              </Field>
            )}
            {(HAS_STATUS[kind] || HAS_FEATURED[kind]) && (
              <div className="grid grid-cols-2 items-end gap-3">
                {HAS_STATUS[kind] && (
                  <Field label="Status">
                    <select value={editing.status} onChange={(e) => setEditing({ ...editing, status: e.target.value as ListingStatus })} className={inputCls}>
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s.replace(/_/g, " ")}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
                {HAS_FEATURED[kind] && (
                  <label className="flex items-center gap-2 pb-2 text-sm text-ink-horizon">
                    <input type="checkbox" checked={editing.featured} onChange={(e) => setEditing({ ...editing, featured: e.target.checked })} />
                    Featured
                  </label>
                )}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Btn type="button" onClick={() => setEditing(null)}>
                Cancel
              </Btn>
              <Btn type="submit" tone="primary" disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </Btn>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
