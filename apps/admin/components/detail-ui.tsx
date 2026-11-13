"use client";

import type { ReactNode } from "react";

/** Small building blocks shared by the admin detail pages, so each page stays about its own data. */

const BADGE: Record<string, string> = {
  active: "bg-acacia/15 text-acacia",
  approved: "bg-acacia/15 text-acacia",
  published: "bg-acacia/15 text-acacia",
  trial: "bg-gold/15 text-gold-deep",
  pending: "bg-gold/15 text-gold-deep",
  pending_review: "bg-gold/15 text-gold-deep",
  draft: "bg-ink-horizon/10 text-ink/60",
  suspended: "bg-plum/10 text-plum",
  rejected: "bg-plum/10 text-plum",
  deactivated: "bg-plum/10 text-plum",
  cancelled: "bg-plum/10 text-plum",
  archived: "bg-ink-horizon/10 text-ink/60",
};

export function StatusBadge({ value }: { value: string }) {
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${BADGE[value] ?? "bg-ink-horizon/10 text-ink/60"}`}>
      {value.replace(/_/g, " ")}
    </span>
  );
}

export function PageHeader({ eyebrow, title, badge, actions, back }: { eyebrow: string; title: string; badge?: ReactNode; actions?: ReactNode; back?: ReactNode }) {
  return (
    <div>
      {back}
      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-gold-deep">{eyebrow}</p>
          <div className="mt-2 flex items-center gap-3">
            <h1 className="font-display text-3xl text-ink-horizon">{title}</h1>
            {badge}
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function Card({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="rounded-xl border border-ink-horizon/10 bg-white p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg text-ink-horizon">{title}</h2>
        {actions}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function KV({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-ink-horizon/5 py-2 text-sm last:border-0">
      <dt className="text-ink/50">{label}</dt>
      <dd className="text-right text-ink-horizon">{children ?? "-"}</dd>
    </div>
  );
}

export function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-lg bg-ink-horizon/[0.03] px-4 py-3">
      <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-ink/40">{label}</p>
      <p className="mt-1 font-display text-2xl text-ink-horizon">{value}</p>
    </div>
  );
}

type Tone = "primary" | "outline" | "danger" | "dangerOutline";
const TONES: Record<Tone, string> = {
  primary: "bg-acacia text-sand-light hover:bg-acacia/90",
  outline: "border border-ink-horizon/20 text-ink-horizon hover:bg-ink-horizon/5",
  danger: "bg-plum text-sand-light hover:bg-plum/90",
  dangerOutline: "border border-plum/30 text-plum hover:bg-plum/10",
};

export function Btn({
  tone = "outline",
  children,
  ...rest
}: { tone?: Tone; children: ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition disabled:opacity-50 ${TONES[tone]} ${rest.className ?? ""}`}
    >
      {children}
    </button>
  );
}

export function Notice({ kind, children }: { kind: "error" | "ok"; children: ReactNode }) {
  return (
    <p className={`mt-4 rounded-lg px-4 py-2 text-sm ${kind === "error" ? "bg-plum/10 text-plum" : "bg-acacia/10 text-acacia"}`}>{children}</p>
  );
}

export const inputCls = "mt-1 w-full rounded-lg border border-ink-horizon/15 bg-white px-3 py-2 text-sm";

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-xs text-ink/60">
      {label}
      {children}
    </label>
  );
}

/** Centered dialog with a dimmed backdrop; clicking the backdrop or Cancel closes it. */
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink-horizon/40 p-4" onClick={onClose} role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-display text-xl text-ink-horizon">{title}</h2>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

export function errMsg(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}
