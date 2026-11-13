"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  deleteOperator,
  getOperatorDetail,
  reinstateOperator,
  removeOperatorStaff,
  reviewOperator,
  reviewOperatorDocument,
  suspendOperator,
  updateOperator,
  type OperatorDetail,
} from "@/lib/api";
import { getToken } from "@/lib/session";
import { useCan } from "@/lib/access";
import { ACTIONS } from "@/lib/access-rules";
import { OperatorRelated } from "@/components/related-lists";
import { Btn, Card, Field, KV, Modal, Notice, PageHeader, Stat, StatusBadge, errMsg, inputCls } from "@/components/detail-ui";

export default function OperatorDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const canManage = useCan(ACTIONS.manageOperators);
  const [op, setOp] = useState<OperatorDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ businessName: "", contactEmail: "", contactPhone: "", description: "" });

  const load = useCallback(() => {
    getOperatorDetail(getToken()!, params.id)
      .then(setOp)
      .catch((e) => setError(errMsg(e, "Could not load this operator.")));
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
    if (!op) return;
    setForm({
      businessName: op.businessName,
      contactEmail: op.contactEmail,
      contactPhone: op.contactPhone ?? "",
      description: op.description ?? "",
    });
    setEditing(true);
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!op) return;
    await run(
      () =>
        updateOperator(getToken()!, op.id, {
          businessName: form.businessName.trim(),
          contactEmail: form.contactEmail.trim(),
          contactPhone: form.contactPhone.trim() || null,
          description: form.description.trim() || null,
        }),
      "Operator saved."
    );
    setEditing(false);
  }

  async function handleDelete() {
    if (!op) return;
    if (!window.confirm(`Delete ${op.businessName}? It disappears from the console and its published packages are archived. Bookings and payments are kept.`)) return;
    setBusy(true);
    try {
      await deleteOperator(getToken()!, op.id);
      router.push("/operators");
    } catch (e) {
      setError(errMsg(e, "Could not delete operator."));
      setBusy(false);
    }
  }

  const back = (
    <Link href="/operators" className="text-sm text-acacia underline">
      ← All operators
    </Link>
  );

  if (!op) {
    return (
      <div className="p-3">
        {back}
        {error ? <Notice kind="error">{error}</Notice> : <p className="mt-6 text-ink/50">Loading…</p>}
      </div>
    );
  }

  const token = () => getToken()!;

  return (
    <div className="p-3">
      <PageHeader
        back={back}
        eyebrow="Operator"
        title={op.businessName}
        badge={<StatusBadge value={op.status} />}
        actions={
          canManage && (
            <>
              <Btn onClick={openEdit} disabled={busy}>
                Edit
              </Btn>
              {op.status === "pending" && (
                <>
                  <Btn tone="dangerOutline" disabled={busy} onClick={() => run(() => reviewOperator(token(), op.id, "rejected"), "Application rejected.")}>
                    Reject
                  </Btn>
                  <Btn tone="primary" disabled={busy} onClick={() => run(() => reviewOperator(token(), op.id, "approved"), "Operator approved.")}>
                    Approve
                  </Btn>
                </>
              )}
              {op.status === "approved" && (
                <Btn
                  tone="dangerOutline"
                  disabled={busy}
                  onClick={() => window.confirm(`Suspend ${op.businessName}?`) && run(() => suspendOperator(token(), op.id), "Operator suspended.")}
                >
                  Suspend
                </Btn>
              )}
              {(op.status === "suspended" || op.status === "rejected") && (
                <Btn tone="primary" disabled={busy} onClick={() => run(() => reinstateOperator(token(), op.id), op.status === "suspended" ? "Operator reinstated." : "Application reopened.")}>
                  {op.status === "suspended" ? "Reinstate" : "Reopen"}
                </Btn>
              )}
              <Btn tone="danger" onClick={handleDelete} disabled={busy}>
                Delete
              </Btn>
            </>
          )
        }
      />

      {message && <Notice kind="ok">{message}</Notice>}
      {error && <Notice kind="error">{error}</Notice>}

      <div className="mt-6 grid gap-3 sm:grid-cols-4">
        <Stat label="Packages" value={op.stats.packages} />
        <Stat label="Published" value={op.stats.publishedPackages} />
        <Stat label="Bookings" value={op.stats.bookings} />
        <Stat label="Paid revenue" value={Number(op.stats.revenuePaid).toLocaleString()} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card title="Business">
          <dl>
            <KV label="Contact email">{op.contactEmail}</KV>
            <KV label="Phone">{op.contactPhone}</KV>
            <KV label="Slug">{op.slug}</KV>
            <KV label="Commission">{op.commissionRatePercent ? `${op.commissionRatePercent}%` : "-"}</KV>
            <KV label="Applied">{new Date(op.createdAt).toLocaleDateString()}</KV>
            <KV label="Approved">{op.approvedAt ? new Date(op.approvedAt).toLocaleDateString() : "-"}</KV>
          </dl>
          {op.description && <p className="mt-3 whitespace-pre-line text-sm text-ink/70">{op.description}</p>}
        </Card>

        <Card title={`Staff (${op.staff.length})`}>
          {op.staff.length === 0 ? (
            <p className="text-sm text-ink/50">No staff accounts.</p>
          ) : (
            <ul className="divide-y divide-ink-horizon/5">
              {op.staff.map((m) => (
                <li key={m.userId} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <div>
                    <Link href={`/users/${m.userId}`} className="text-ink-horizon underline-offset-2 hover:underline">
                      {m.firstName} {m.lastName}
                    </Link>
                    <p className="text-xs text-ink/50">
                      {m.email}
                      {m.title ? ` · ${m.title}` : ""}
                    </p>
                  </div>
                  {canManage && (
                    <Btn
                      tone="dangerOutline"
                      disabled={busy}
                      onClick={() =>
                        window.confirm(`Remove ${m.firstName} from this operator?`) &&
                        run(() => removeOperatorStaff(token(), op.id, m.userId), "Staff member removed.")
                      }
                    >
                      Remove
                    </Btn>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title={`Documents (${op.documents.length})`}>
          {op.documents.length === 0 ? (
            <p className="text-sm text-ink/50">No documents submitted.</p>
          ) : (
            <ul className="divide-y divide-ink-horizon/5">
              {op.documents.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <div>
                    <p className="capitalize text-ink-horizon">{d.documentType.replace(/_/g, " ")}</p>
                    <p className="text-xs text-ink/50">Submitted {new Date(d.createdAt).toLocaleDateString()}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge value={d.status} />
                    {canManage && d.status === "pending" && (
                      <>
                        <Btn tone="dangerOutline" disabled={busy} onClick={() => run(() => reviewOperatorDocument(token(), d.id, "rejected"), "Document rejected.")}>
                          Reject
                        </Btn>
                        <Btn tone="primary" disabled={busy} onClick={() => run(() => reviewOperatorDocument(token(), d.id, "approved"), "Document approved.")}>
                          Approve
                        </Btn>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="History">
          {op.history.length === 0 ? (
            <p className="text-sm text-ink/50">No recorded changes yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {op.history.map((h) => (
                <li key={h.id} className="flex justify-between gap-3">
                  <span className="capitalize text-ink-horizon">{h.action.replace(/^operator\./, "").replace(/[._]/g, " ")}</span>
                  <span className="font-mono text-xs text-ink/40">{new Date(h.createdAt).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <OperatorRelated operatorId={op.id} />

      {editing && (
        <Modal title="Edit operator" onClose={() => setEditing(false)}>
          <form onSubmit={saveEdit} className="space-y-3">
            <Field label="Business name">
              <input required minLength={2} value={form.businessName} onChange={(e) => setForm((f) => ({ ...f, businessName: e.target.value }))} className={inputCls} />
            </Field>
            <Field label="Contact email">
              <input required type="email" value={form.contactEmail} onChange={(e) => setForm((f) => ({ ...f, contactEmail: e.target.value }))} className={inputCls} />
            </Field>
            <Field label="Contact phone">
              <input value={form.contactPhone} onChange={(e) => setForm((f) => ({ ...f, contactPhone: e.target.value }))} className={inputCls} />
            </Field>
            <Field label="Description">
              <textarea rows={4} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className={inputCls} />
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
