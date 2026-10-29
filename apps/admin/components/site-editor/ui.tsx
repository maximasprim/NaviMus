"use client";

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { ApiError } from "@/lib/api-client";
import { deepEqual } from "@/lib/site-form";
import type { SiteAdminView, SiteContent } from "@/lib/site-api";

/** Shared pieces for the Site content editor: cards, fields, repeatable lists, and the save bar. */

export interface EditorProps {
  data: SiteAdminView;
  token: string;
  /** Called with the fresh view after a successful save. */
  onSaved: (view: SiteAdminView) => void;
  /** Reports whether this tab has unsaved edits (shown as a dot on the tab). */
  onDirty: (dirty: boolean) => void;
}

/** Page frame for the Site content page (self-contained, so this feature has no dependency on other admin pages). */
export function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-full bg-canvas">
      <div className="mx-auto max-w-[1200px] px-6 py-8 lg:px-10 lg:py-10">{children}</div>
    </div>
  );
}

export function PageSkeleton() {
  return (
    <PageShell>
      <div role="status" aria-live="polite">
        <span className="sr-only">Loading site content…</span>
        <div className="h-8 w-48 rounded-lg bg-hairline/60 motion-safe:animate-pulse" aria-hidden />
        <div className="mt-8 h-96 max-w-3xl rounded-2xl bg-hairline/60 motion-safe:animate-pulse" aria-hidden />
      </div>
    </PageShell>
  );
}

export function Card({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-hairline bg-white p-6">
      <h2 className="text-sm font-semibold text-ink-horizon">{title}</h2>
      {description && <p className="mt-1 max-w-2xl text-sm text-fog">{description}</p>}
      <div className="mt-5 space-y-5">{children}</div>
    </section>
  );
}

const inputClass =
  "w-full rounded-lg border border-hairline bg-white px-3 py-2 text-sm text-ink placeholder:text-ink/35 focus:border-acacia disabled:bg-canvas disabled:text-ink/50";

export function Field({
  label,
  hint,
  children,
  htmlFor,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-ink-horizon">
        {label}
      </label>
      <div className="mt-1.5">{children}</div>
      {hint && <p className="mt-1.5 text-xs text-fog">{hint}</p>}
    </div>
  );
}

export function TextInput({
  label,
  value,
  onChange,
  placeholder,
  hint,
  maxLength,
  type = "text",
  disabled,
  prefix,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: ReactNode;
  maxLength?: number;
  type?: "text" | "email" | "url" | "tel";
  disabled?: boolean;
  prefix?: string;
}) {
  const id = useId();
  return (
    <Field label={label} hint={hint} htmlFor={id}>
      <div className="flex items-stretch">
        {prefix && (
          <span className="flex items-center rounded-l-lg border border-r-0 border-hairline bg-canvas px-3 text-sm text-fog">{prefix}</span>
        )}
        <input
          id={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          maxLength={maxLength}
          disabled={disabled}
          className={`${inputClass} ${prefix ? "rounded-l-none" : ""}`}
        />
      </div>
    </Field>
  );
}

export function TextArea({
  label,
  value,
  onChange,
  placeholder,
  hint,
  maxLength,
  rows = 3,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: ReactNode;
  maxLength?: number;
  rows?: number;
}) {
  const id = useId();
  return (
    <Field label={label} hint={hint} htmlFor={id}>
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        rows={rows}
        className={`${inputClass} resize-y`}
      />
      {maxLength && value.length > maxLength * 0.8 && (
        <p className="mt-1 text-right text-xs tabular-nums text-fog">
          {value.length}/{maxLength}
        </p>
      )}
    </Field>
  );
}

export function GhostButton({
  children,
  onClick,
  disabled,
  danger,
  title,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`rounded-lg border px-3 py-1.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        danger ? "border-plum/30 text-plum hover:bg-plum/5" : "border-hairline text-ink-horizon hover:bg-canvas"
      }`}
    >
      {children}
    </button>
  );
}

/**
 * A list the admin can add to, remove from and reorder. Each row is rendered by the caller; this owns
 * the chrome and the max-length rule.
 */
export function ListEditor<T>({
  items,
  onChange,
  makeEmpty,
  max,
  addLabel,
  itemLabel,
  renderItem,
  emptyText,
}: {
  items: T[];
  onChange: (next: T[]) => void;
  makeEmpty: () => T;
  max: number;
  addLabel: string;
  itemLabel: string;
  renderItem: (item: T, update: (next: T) => void, index: number) => ReactNode;
  emptyText?: string;
}) {
  const move = (from: number, to: number) => {
    if (to < 0 || to >= items.length) return;
    const next = items.slice();
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved as T);
    onChange(next);
  };
  return (
    <div className="space-y-3">
      {items.length === 0 && emptyText && <p className="rounded-lg border border-dashed border-hairline px-4 py-3 text-sm text-fog">{emptyText}</p>}
      {items.map((item, i) => (
        <div key={i} className="rounded-xl border border-hairline bg-canvas/50 p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-fog">
              {itemLabel} {i + 1}
            </span>
            <div className="flex gap-1.5">
              <GhostButton onClick={() => move(i, i - 1)} disabled={i === 0} title="Move up">
                ↑
              </GhostButton>
              <GhostButton onClick={() => move(i, i + 1)} disabled={i === items.length - 1} title="Move down">
                ↓
              </GhostButton>
              <GhostButton danger onClick={() => onChange(items.filter((_, j) => j !== i))}>
                Remove
              </GhostButton>
            </div>
          </div>
          {renderItem(item, (next) => onChange(items.map((x, j) => (j === i ? next : x))), i)}
        </div>
      ))}
      <GhostButton onClick={() => onChange([...items, makeEmpty()])} disabled={items.length >= max}>
        {items.length >= max ? `Maximum of ${max} reached` : `+ ${addLabel}`}
      </GhostButton>
    </div>
  );
}

/** Draft state for one tab: tracks whether it differs from what's saved, and reports that upward. */
export function useDraft<T>(initial: T, onDirty: (dirty: boolean) => void) {
  const [draft, setDraft] = useState<T>(initial);
  const baseline = useRef(initial);
  const dirty = useMemo(() => !deepEqual(draft, baseline.current), [draft]);
  useEffect(() => {
    onDirty(dirty);
  }, [dirty, onDirty]);
  return {
    draft,
    setDraft,
    dirty,
    /** After a successful save: the current draft becomes the new baseline. */
    markSaved: () => {
      baseline.current = draft;
      onDirty(false);
    },
    resetTo: (next: T) => {
      baseline.current = next;
      setDraft(next);
    },
  };
}

/** Runs a save, tracking progress, a success note and any error (including the server's own message). */
export function useSaver() {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  async function run(action: () => Promise<void>, doneText = "Saved") {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await action();
      setNotice(doneText);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.status === 400
            ? `The server rejected some values: ${err.message}`
            : err.message
          : "Could not save. Please try again."
      );
    } finally {
      setSaving(false);
    }
  }
  return { saving, error, notice, run, clear: () => (setError(null), setNotice(null)) };
}

export function SaveBar({
  dirty,
  saving,
  problems,
  error,
  notice,
  onSave,
  onResetSections,
  saveLabel = "Save changes",
}: {
  dirty: boolean;
  saving: boolean;
  problems: string[];
  error: string | null;
  notice: string | null;
  onSave: () => void;
  /** Optional: put every section on this tab back to the platform defaults. */
  onResetSections?: () => void;
  saveLabel?: string;
}) {
  return (
    <div className="sticky bottom-0 -mx-1 rounded-2xl border border-hairline bg-white/95 p-4 backdrop-blur">
      {problems.length > 0 && (
        <ul role="alert" className="mb-3 list-disc space-y-0.5 pl-5 text-sm text-plum">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="mb-3 text-sm text-plum">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onSave}
          disabled={saving || !dirty || problems.length > 0}
          className="rounded-lg bg-ink-horizon px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-acacia disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? "Saving…" : saveLabel}
        </button>
        {onResetSections && (
          <GhostButton onClick={onResetSections} disabled={saving} danger>
            Reset to defaults
          </GhostButton>
        )}
        <span role="status" className="text-sm text-fog">
          {dirty ? "You have unsaved changes" : (notice ?? "")}
        </span>
      </div>
    </div>
  );
}

/** Convenience: placeholder text that shows the platform default for a field. */
export function defaultHint(value: string | undefined): string | undefined {
  return value ? `Default: ${value.length > 70 ? `${value.slice(0, 70)}…` : value}` : undefined;
}

export type { SiteContent };
