"use client";

import { Btn } from "@/components/detail-ui";

export function Pager({ page, meta, onPage }: { page: number; meta?: { total?: number; totalPages?: number } | null; onPage: (p: number) => void }) {
  const pages = meta?.totalPages ?? 1;
  if (pages <= 1) return null;
  return (
    <div className="mt-4 flex items-center justify-between text-xs text-ink/50">
      <span>{meta?.total ?? 0} total</span>
      <div className="flex items-center gap-2">
        <Btn disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </Btn>
        <span>
          {page} / {pages}
        </span>
        <Btn disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Next
        </Btn>
      </div>
    </div>
  );
}

export const money = (amount: string | number | null | undefined, currency?: string | null) => `${currency ?? ""} ${Number(amount ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`.trim();
