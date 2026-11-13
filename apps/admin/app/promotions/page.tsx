"use client";

import { useCallback, useEffect, useState } from "react";
import {
  addPromotionRule,
  createCoupon,
  createPromotion,
  deleteCoupon,
  deletePromotion,
  deletePromotionRule,
  listCoupons,
  listPromotions,
  updateCoupon,
  updatePromotion,
  type Coupon,
  type Promotion,
} from "@/lib/api";
import { getToken } from "@/lib/session";
import { useCan } from "@/lib/access";
import { Btn, Card, Modal, Notice, StatusBadge, errMsg } from "@/components/detail-ui";
import { FieldInput, initialValues, toPayload, type FieldDef, type FormValues } from "@/components/record-fields";
import { HistoryCard } from "@/components/history-card";
import { Pager } from "@/components/pager";

const CURRENCIES = ["KES", "USD", "EUR", "GBP", "TZS", "UGX", "AED", "ZAR"].map((v) => ({ value: v, label: v }));
const DISCOUNT_TYPES = [{ value: "percentage", label: "Percentage off" }, { value: "fixed_amount", label: "Fixed amount off" }];

const COUPON_FIELDS: FieldDef[] = [
  { key: "code", label: "Code", type: "text", required: true, help: "Letters, numbers, - and _. Saved in capitals." },
  { key: "discountType", label: "Discount", type: "select", required: true, options: DISCOUNT_TYPES },
  { key: "discountValue", label: "Value (percent, or amount)", type: "money", required: true },
  { key: "currency", label: "Currency (fixed amounts only)", type: "select", options: CURRENCIES },
  { key: "maxUses", label: "Maximum uses", type: "number", help: "Empty means unlimited." },
  { key: "minBookingAmount", label: "Minimum booking amount", type: "money" },
  { key: "validFrom", label: "Valid from", type: "date" },
  { key: "validUntil", label: "Valid until", type: "date" },
  { key: "isActive", label: "Active", type: "checkbox" },
];

const PROMO_TYPES = ["seasonal", "early_booking", "group", "last_minute", "flash_sale", "loyalty", "partner"].map((v) => ({ value: v, label: v.replace(/_/g, " ") }));
const PROMO_FIELDS: FieldDef[] = [
  { key: "name", label: "Name", type: "text", required: true },
  { key: "type", label: "Kind", type: "select", required: true, options: PROMO_TYPES },
  { key: "description", label: "Description", type: "text" },
  { key: "startsAt", label: "Starts", type: "date" },
  { key: "endsAt", label: "Ends", type: "date" },
  { key: "isActive", label: "Active", type: "checkbox" },
];
const RULE_FIELDS: FieldDef[] = [
  { key: "conditionKey", label: "Applies when", type: "text", required: true, placeholder: "min_travelers, days_before_travel…" },
  { key: "conditionValue", label: "Is at least / equals", type: "text", required: true },
  { key: "discountType", label: "Discount", type: "select", required: true, options: DISCOUNT_TYPES },
  { key: "discountValue", label: "Value", type: "money", required: true },
];

/** The date part of an ISO timestamp, for a date input. */
const dayOf = (iso: string | null) => (iso ? iso.slice(0, 10) : "");
/** A date input value -> an ISO timestamp (start or end of that day, local time). */
const toIso = (v: unknown, end: boolean) => (typeof v === "string" && v ? new Date(`${v}T${end ? "23:59:59" : "00:00:00"}`).toISOString() : v);

type Form = { title: string; fields: FieldDef[]; values: FormValues; submit: (v: FormValues) => Promise<unknown> } | null;

export default function PromotionsPage() {
  const canEdit = useCan({ roles: ["admin", "marketing_manager"] });
  const [tab, setTab] = useState<"coupons" | "campaigns">("coupons");
  const [coupons, setCoupons] = useState<Coupon[] | null>(null);
  const [meta, setMeta] = useState<any>(null);
  const [page, setPage] = useState(1);
  const [promos, setPromos] = useState<Promotion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [historyFor, setHistoryFor] = useState<{ type: "coupon" | "promotion"; id: string } | null>(null);

  const load = useCallback(() => {
    const t = getToken()!;
    listCoupons(t, { page }).then((r) => { setCoupons(r.items); setMeta(r.meta); }).catch((e) => { setCoupons([]); setError(errMsg(e, "Could not load coupons.")); });
    listPromotions(t).then(setPromos).catch((e) => { setPromos([]); setError(errMsg(e, "Could not load campaigns.")); });
  }, [page]);
  useEffect(load, [load]);

  function openForm(f: NonNullable<Form>) {
    setFormError(null);
    setForm(f);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    setFormError(null);
    try {
      await form.submit(form.values);
      setForm(null);
      load();
    } catch (err) {
      setFormError(errMsg(err, "Could not save."));
    } finally {
      setSaving(false);
    }
  }

  async function act(fn: () => Promise<unknown>, confirm?: string) {
    if (confirm && !window.confirm(confirm)) return;
    setError(null);
    try {
      await fn();
      load();
    } catch (err) {
      setError(errMsg(err, "That didn't work."));
    }
  }

  const couponForm = (c?: Coupon) =>
    openForm({
      title: c ? "Edit coupon" : "New coupon",
      fields: COUPON_FIELDS,
      values: initialValues(COUPON_FIELDS, c as any, { isActive: true, discountType: "percentage" }),
      submit: (v) => (c ? updateCoupon(getToken()!, c.id, toPayload(COUPON_FIELDS, v, "update")) : createCoupon(getToken()!, toPayload(COUPON_FIELDS, v, "create") as any)),
    });

  const promoPayload = (v: FormValues, mode: "create" | "update") => {
    const p = toPayload(PROMO_FIELDS, v, mode);
    if ("startsAt" in p) p.startsAt = toIso(p.startsAt, false);
    if ("endsAt" in p) p.endsAt = toIso(p.endsAt, true);
    return p;
  };
  const promoForm = (pr?: Promotion) =>
    openForm({
      title: pr ? "Edit campaign" : "New campaign",
      fields: PROMO_FIELDS,
      values: initialValues(PROMO_FIELDS, pr ? { ...pr, startsAt: dayOf(pr.startsAt), endsAt: dayOf(pr.endsAt) } : undefined, { isActive: true, type: "seasonal" }),
      submit: (v) => (pr ? updatePromotion(getToken()!, pr.id, promoPayload(v, "update") as any) : createPromotion(getToken()!, promoPayload(v, "create") as any)),
    });
  const ruleForm = (pr: Promotion) =>
    openForm({
      title: `Add a rule to ${pr.name}`,
      fields: RULE_FIELDS,
      values: initialValues(RULE_FIELDS, undefined, { discountType: "percentage" }),
      submit: (v) => addPromotionRule(getToken()!, pr.id, toPayload(RULE_FIELDS, v, "create") as any),
    });

  return (
    <div className="space-y-6 p-8">
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-gold-deep">Marketing</p>
        <h1 className="mt-2 font-display text-3xl text-ink-horizon">Promotions</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink/60">Coupon codes customers type in, and campaigns that apply a discount automatically when their rules match.</p>
      </div>
      {error && <Notice kind="error">{error}</Notice>}

      <div className="flex gap-1 border-b border-ink-horizon/10">
        {(["coupons", "campaigns"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`-mb-px border-b-2 px-4 py-2 text-sm capitalize ${tab === t ? "border-acacia text-ink-horizon" : "border-transparent text-ink/50 hover:text-ink-horizon"}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === "coupons" && (
        <Card title="Coupons" actions={canEdit ? <Btn tone="primary" onClick={() => couponForm()}>New coupon</Btn> : undefined}>
          {coupons === null && <p className="text-sm text-ink/50">Loading…</p>}
          {coupons && coupons.length === 0 && <p className="text-sm text-ink/50">No coupons yet.</p>}
          {coupons && coupons.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-ink-horizon/10 text-xs uppercase tracking-wide text-ink/40">
                    <th className="pb-2 pr-4 font-normal">Code</th>
                    <th className="pb-2 pr-4 font-normal">Discount</th>
                    <th className="pb-2 pr-4 font-normal">Used</th>
                    <th className="pb-2 pr-4 font-normal">Valid</th>
                    <th className="pb-2 pr-4 font-normal">Status</th>
                    <th className="pb-2" />
                  </tr>
                </thead>
                <tbody>
                  {coupons.map((c) => (
                    <tr key={c.id} className="border-b border-ink-horizon/5">
                      <td className="py-2 pr-4 font-mono text-xs">{c.code}</td>
                      <td className="py-2 pr-4">{c.discountType === "percentage" ? `${Number(c.discountValue)}%` : `${c.currency ?? ""} ${Number(c.discountValue).toLocaleString()}`}</td>
                      <td className="py-2 pr-4">{c.usedCount}{c.maxUses ? ` / ${c.maxUses}` : ""}</td>
                      <td className="py-2 pr-4 text-xs text-ink/50">{c.validFrom ?? "any time"} → {c.validUntil ?? "no end"}</td>
                      <td className="py-2 pr-4"><StatusBadge value={c.isActive ? "active" : "inactive"} /></td>
                      <td className="py-2">
                        <div className="flex justify-end gap-2">
                          <Btn onClick={() => setHistoryFor(historyFor?.id === c.id ? null : { type: "coupon", id: c.id })}>History</Btn>
                          {canEdit && (
                            <>
                              <Btn onClick={() => couponForm(c)}>Edit</Btn>
                              <Btn onClick={() => act(() => updateCoupon(getToken()!, c.id, { isActive: !c.isActive }))}>{c.isActive ? "Deactivate" : "Activate"}</Btn>
                              <Btn tone="dangerOutline" onClick={() => act(() => deleteCoupon(getToken()!, c.id), `Delete coupon ${c.code}? A coupon that has been used can't be deleted. Deactivate it instead.`)}>Delete</Btn>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pager page={page} meta={meta} onPage={setPage} />
        </Card>
      )}

      {tab === "campaigns" && (
        <Card title="Campaigns" actions={canEdit ? <Btn tone="primary" onClick={() => promoForm()}>New campaign</Btn> : undefined}>
          {promos === null && <p className="text-sm text-ink/50">Loading…</p>}
          {promos && promos.length === 0 && <p className="text-sm text-ink/50">No campaigns yet.</p>}
          <ul className="space-y-4">
            {promos?.map((pr) => (
              <li key={pr.id} className="rounded-lg border border-ink-horizon/10 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-ink-horizon">{pr.name} <span className="ml-2 text-xs capitalize text-ink/40">{pr.type.replace(/_/g, " ")}</span></p>
                    <p className="text-xs text-ink/50">{pr.startsAt ? new Date(pr.startsAt).toLocaleDateString() : "any time"} → {pr.endsAt ? new Date(pr.endsAt).toLocaleDateString() : "no end"}{pr.description ? ` · ${pr.description}` : ""}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge value={pr.isActive ? "active" : "inactive"} />
                    <Btn onClick={() => setHistoryFor(historyFor?.id === pr.id ? null : { type: "promotion", id: pr.id })}>History</Btn>
                    {canEdit && (
                      <>
                        <Btn onClick={() => promoForm(pr)}>Edit</Btn>
                        <Btn onClick={() => act(() => updatePromotion(getToken()!, pr.id, { isActive: !pr.isActive }))}>{pr.isActive ? "Deactivate" : "Activate"}</Btn>
                        <Btn tone="dangerOutline" onClick={() => act(() => deletePromotion(getToken()!, pr.id), `Delete the campaign ${pr.name} and its rules?`)}>Delete</Btn>
                      </>
                    )}
                  </div>
                </div>
                <div className="mt-3 border-t border-ink-horizon/5 pt-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs uppercase tracking-wide text-ink/40">Rules ({pr.rules.length})</p>
                    {canEdit && <Btn onClick={() => ruleForm(pr)}>Add rule</Btn>}
                  </div>
                  {pr.rules.length === 0 ? (
                    <p className="mt-2 text-sm text-ink/50">No rules yet. A campaign without rules gives no discount.</p>
                  ) : (
                    <ul className="mt-2 space-y-1 text-sm">
                      {pr.rules.map((r) => (
                        <li key={r.id} className="flex items-center justify-between gap-3">
                          <span>
                            When <span className="font-mono text-xs">{r.conditionKey}</span> = {r.conditionValue}: {r.discountType === "percentage" ? `${Number(r.discountValue)}% off` : `${Number(r.discountValue)} off`}
                          </span>
                          {canEdit && <Btn tone="dangerOutline" onClick={() => act(() => deletePromotionRule(getToken()!, r.id), "Remove this rule?")}>Remove</Btn>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {historyFor && <HistoryCard resourceType={historyFor.type} resourceId={historyFor.id} />}

      {form && (
        <Modal title={form.title} onClose={() => setForm(null)}>
          <form onSubmit={submit} className="space-y-3">
            {formError && <Notice kind="error">{formError}</Notice>}
            {form.fields.map((f) => (
              <FieldInput key={f.key} field={f} value={form.values[f.key] ?? ""} onChange={(v) => setForm((s) => (s ? { ...s, values: { ...s.values, [f.key]: v } } : s))} />
            ))}
            <div className="flex justify-end gap-2 pt-2">
              <Btn type="button" onClick={() => setForm(null)}>Cancel</Btn>
              <Btn type="submit" tone="primary" disabled={saving}>{saving ? "Saving…" : "Save"}</Btn>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
