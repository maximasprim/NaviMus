"use client";

import type { ReactNode } from "react";
import { Field, inputCls } from "@/components/detail-ui";

/** One editable field of a record. The same description drives the table column, the add/edit form and the payload. */
export interface FieldDef {
  key: string;
  label: string;
  type: "text" | "textarea" | "number" | "money" | "date" | "time" | "select" | "checkbox";
  required?: boolean;
  options?: { value: string; label: string }[];
  placeholder?: string;
  /** Not shown as a table column (long text, for example). */
  hideInTable?: boolean;
  /** Shown but can't be changed after creation. */
  createOnly?: boolean;
  /** Shown in the table only; never in the form or the payload. */
  tableOnly?: boolean;
  help?: string;
}

export type FormValues = Record<string, string | boolean>;

/** A row value as the form's text/checkbox value. */
export function toFormValue(f: FieldDef, raw: unknown): string | boolean {
  if (f.type === "checkbox") return Boolean(raw);
  if (raw === null || raw === undefined) return "";
  if (f.type === "time") return String(raw).slice(0, 5); // 14:00:00 -> 14:00
  if (f.type === "date") return String(raw).slice(0, 10);
  return String(raw);
}

export function initialValues(fields: FieldDef[], row?: Record<string, any>, defaults: Record<string, unknown> = {}): FormValues {
  const out: FormValues = {};
  for (const f of fields) out[f.key] = toFormValue(f, row ? row[f.key] : defaults[f.key]);
  return out;
}

/**
 * Form values -> what the API expects. When editing, an emptied optional field is sent as null (to clear it); when
 * creating, it is left out.
 */
export function toPayload(fields: FieldDef[], values: FormValues, mode: "create" | "update"): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    if (f.tableOnly || (mode === "update" && f.createOnly)) continue;
    const v = values[f.key];
    if (f.type === "checkbox") {
      out[f.key] = Boolean(v);
      continue;
    }
    const s = typeof v === "string" ? v.trim() : "";
    if (s === "") {
      if (mode === "update" && !f.required) out[f.key] = null;
      continue;
    }
    out[f.key] = f.type === "number" || f.type === "money" ? Number(s) : s;
  }
  return out;
}

export function displayValue(f: FieldDef, raw: unknown): ReactNode {
  if (f.type === "checkbox") return raw ? "Yes" : "No";
  if (raw === null || raw === undefined || raw === "") return <span className="text-ink/30">-</span>;
  if (f.type === "select") return f.options?.find((o) => o.value === raw)?.label ?? String(raw);
  return String(raw);
}

export function FieldInput({
  field,
  value,
  onChange,
  disabled,
}: {
  field: FieldDef;
  value: string | boolean;
  onChange: (v: string | boolean) => void;
  disabled?: boolean;
}) {
  if (field.type === "checkbox") {
    return (
      <label className="flex items-center gap-2 pt-5 text-sm text-ink-horizon">
        <input type="checkbox" checked={Boolean(value)} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
        {field.label}
      </label>
    );
  }
  const common = { disabled, className: inputCls, required: field.required, placeholder: field.placeholder };
  let control: ReactNode;
  switch (field.type) {
    case "textarea":
      control = <textarea rows={4} {...common} value={String(value)} onChange={(e) => onChange(e.target.value)} />;
      break;
    case "select":
      control = (
        <select {...common} value={String(value)} onChange={(e) => onChange(e.target.value)}>
          {!field.required && <option value="">-</option>}
          {field.required && value === "" && <option value="">Choose…</option>}
          {field.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
      break;
    case "number":
      control = <input type="number" step="1" {...common} value={String(value)} onChange={(e) => onChange(e.target.value)} />;
      break;
    case "money":
      control = <input type="number" step="0.01" min="0" {...common} value={String(value)} onChange={(e) => onChange(e.target.value)} />;
      break;
    case "date":
      control = <input type="date" {...common} value={String(value)} onChange={(e) => onChange(e.target.value)} />;
      break;
    case "time":
      control = <input type="time" {...common} value={String(value)} onChange={(e) => onChange(e.target.value)} />;
      break;
    default:
      control = <input type="text" {...common} value={String(value)} onChange={(e) => onChange(e.target.value)} />;
  }
  return (
    <Field label={field.label + (field.required ? " *" : "")}>
      {control}
      {field.help && <span className="mt-1 block text-[11px] text-ink/40">{field.help}</span>}
    </Field>
  );
}
