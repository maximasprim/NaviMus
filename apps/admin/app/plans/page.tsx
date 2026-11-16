"use client";

import { useCallback, useEffect, useState } from "react";
import { createPlan, listPlans, setPlanStripePrice, updatePlan, type PlanFull } from "@/lib/api";
import { getToken } from "@/lib/session";
import { Btn, Card, Modal, Notice, StatusBadge, errMsg } from "@/components/detail-ui";
import { FieldInput, initialValues, toPayload, type FieldDef, type FormValues } from "@/components/record-fields";

const CREATE_FIELDS: FieldDef[] = [
  { key: "code", label: "Code", type: "text", required: true, createOnly: true, help: "Lowercase, e.g. growth. Can't change later." },
  { key: "name", label: "Name", type: "text", required: true },
  { key: "description", label: "Description", type: "text" },
  { key: "monthlyPriceUsd", label: "Monthly price (USD)", type: "money", required: true },
  { key: "maxBookingsPerMonth", label: "Bookings per month", type: "number", help: "Empty means unlimited." },
  { key: "maxOperators", label: "Operators", type: "number", help: "Empty means unlimited." },
  { key: "maxStaffUsers", label: "Staff users", type: "number", help: "Empty means unlimited." },
  { key: "commissionRatePercent", label: "Platform commission (%)", type: "money", help: "Optional rate for tenants on this plan." },
  { key: "isActive", label: "Offered to tenants", type: "checkbox" },
];

const lim = (n: number | null) => (n === null ? "Unlimited" : String(n));

/** Platform admin: the plans tenants can be on, their prices and limits. */
export default function PlansPage() {
  const [plans, setPlans] = useState<PlanFull[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ plan?: PlanFull } | null>(null);
  const [values, setValues] = useState<FormValues>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    listPlans(getToken()!).then((p) => setPlans(p as PlanFull[])).catch((e) => { setPlans([]); setError(errMsg(e, "Could not load plans.")); });
  }, []);
  useEffect(load, [load]);

  function open(plan?: PlanFull) {
    setValues(initialValues(CREATE_FIELDS, plan as any, { isActive: true }));
    setFormError(null);
    setEditing({ plan });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      if (editing?.plan) {
        const before = toPayload(CREATE_FIELDS, initialValues(CREATE_FIELDS, editing.plan as any), "update");
        const next = toPayload(CREATE_FIELDS, values, "update");
        const changed = Object.fromEntries(Object.entries(next).filter(([k, v]) => before[k] !== v));
        if (Object.keys(changed).length === 0) {
          setEditing(null);
          return;
        }
        const res = await updatePlan(getToken()!, editing.plan.id, changed);
        setMessage(res.stripePriceUnmapped ? "Saved. The price changed, so this plan's Stripe price was unlinked. Link a matching Stripe price before tenants can buy it." : "Saved.");
      } else {
        await createPlan(getToken()!, toPayload(CREATE_FIELDS, values, "create") as any);
        setMessage("Plan created.");
      }
      setEditing(null);
      load();
    } catch (err) {
      setFormError(errMsg(err, "Could not save."));
    } finally {
      setSaving(false);
    }
  }

  async function linkStripe(p: PlanFull) {
    const id = window.prompt(`Stripe price id for ${p.name} (looks like price_123). Leave empty to unlink.`, p.stripePriceId ?? "");
    if (id === null) return;
    setError(null);
    try {
      await setPlanStripePrice(getToken()!, p.id, id.trim() || null);
      setMessage(id.trim() ? "Stripe price linked." : "Stripe price unlinked.");
      load();
    } catch (err) {
      setError(errMsg(err, "Stripe rejected that price."));
    }
  }

  return (
    <div className="space-y-4 p-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-gold-deep">Platform</p>
          <h1 className="mt-2 font-display text-3xl text-ink-horizon">Plans &amp; pricing</h1>
          <p className="mt-2 max-w-2xl text-sm text-ink/60">What tenants can subscribe to. To put a tenant on a plan by hand, open the tenant and use Assign plan.</p>
        </div>
        <Btn tone="primary" onClick={() => open()}>New plan</Btn>
      </div>
      {error && <Notice kind="error">{error}</Notice>}
      {message && <Notice kind="ok">{message}</Notice>}
      {plans === null && <p className="text-sm text-ink/50">Loading…</p>}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {plans?.map((p) => (
          <Card key={p.id} title={p.name} actions={<StatusBadge value={p.isActive ? "active" : "inactive"} />}>
            <p className="font-display text-2xl text-ink-horizon">{Number(p.monthlyPriceUsd) === 0 ? "Free" : `$${Number(p.monthlyPriceUsd).toFixed(2)}`}<span className="text-sm text-ink/40">{Number(p.monthlyPriceUsd) === 0 ? "" : " / month"}</span></p>
            {p.description && <p className="mt-1 text-xs text-ink/50">{p.description}</p>}
            <ul className="mt-3 space-y-0.5 text-sm text-ink/70">
              <li>{lim(p.maxBookingsPerMonth)} bookings / month</li>
              <li>{lim(p.maxOperators)} operators</li>
              <li>{lim(p.maxStaffUsers)} staff users</li>
              {p.commissionRatePercent && <li>{Number(p.commissionRatePercent)}% commission</li>}
            </ul>
            <p className="mt-3 font-mono text-[11px] text-ink/40">code: {p.code} · Stripe: {p.stripePriceId ?? "not linked"}</p>
            <div className="mt-4 flex gap-2">
              <Btn onClick={() => open(p)}>Edit</Btn>
              <Btn onClick={() => linkStripe(p)}>Stripe price</Btn>
            </div>
          </Card>
        ))}
      </div>
      {editing && (
        <Modal title={editing.plan ? `Edit ${editing.plan.name}` : "New plan"} onClose={() => setEditing(null)}>
          <form onSubmit={save} className="space-y-3">
            {formError && <Notice kind="error">{formError}</Notice>}
            {editing.plan && <Notice kind="ok">Changing the price unlinks the Stripe price. Tenants already subscribed keep what they pay.</Notice>}
            {CREATE_FIELDS.map((f) => (
              <FieldInput key={f.key} field={f} value={values[f.key] ?? ""} disabled={Boolean(editing.plan && f.createOnly)} onChange={(v) => setValues((s) => ({ ...s, [f.key]: v }))} />
            ))}
            <div className="flex justify-end gap-2 pt-2">
              <Btn type="button" onClick={() => setEditing(null)}>Cancel</Btn>
              <Btn type="submit" tone="primary" disabled={saving}>{saving ? "Saving…" : "Save"}</Btn>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
