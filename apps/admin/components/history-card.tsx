"use client";

import { useCallback, useEffect, useState } from "react";
import { listHistory, type HistoryEntry, type HistoryType } from "@/lib/api";
import { getToken } from "@/lib/session";
import { useCan } from "@/lib/access";
import { Btn, Card } from "@/components/detail-ui";

const SKIP_KEYS = new Set(["fields"]);

function describe(h: HistoryEntry): string {
  const m = h.metadata ?? {};
  const parts: string[] = [];
  if (Array.isArray(m.fields) && m.fields.length) parts.push(`changed ${(m.fields as string[]).join(", ")}`);
  if (typeof m.child === "string") parts.push(`${String(m.child).replace(/-/g, " ")} ${String(m.op ?? "changed")}`);
  for (const [k, v] of Object.entries(m)) {
    if (SKIP_KEYS.has(k) || k === "child" || k === "op") continue;
    if (typeof v === "string" || typeof v === "number") parts.push(`${k}: ${v}`);
    else if (Array.isArray(v)) parts.push(`${k}: ${v.join(", ")}`);
  }
  return parts.join(" · ");
}

/** Who changed this record and when, newest first. Shown to admins only (the API refuses anyone else). */
export function HistoryCard({ resourceType, resourceId }: { resourceType: HistoryType; resourceId: string }) {
  const allowed = useCan({ roles: ["admin"] });
  const [items, setItems] = useState<HistoryEntry[] | null>(null);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);

  const load = useCallback(() => {
    listHistory(getToken()!, resourceType, resourceId, page)
      .then(({ items, meta }) => {
        setItems(items);
        setPages(Math.max(1, Math.ceil(((meta as any)?.total ?? items.length) / ((meta as any)?.pageSize ?? 15))));
      })
      .catch(() => setItems([]));
  }, [resourceType, resourceId, page]);

  useEffect(() => {
    if (allowed) load();
  }, [allowed, load]);

  if (!allowed) return null;

  return (
    <Card title="History">
      {items === null && <p className="text-sm text-ink/50">Loading…</p>}
      {items && items.length === 0 && <p className="text-sm text-ink/50">No recorded changes yet.</p>}
      {items && items.length > 0 && (
        <ul className="space-y-3 text-sm">
          {items.map((h) => {
            const who = [h.actorFirstName, h.actorLastName].filter(Boolean).join(" ") || h.actorEmail || "System";
            const extra = describe(h);
            return (
              <li key={h.id} className="border-l-2 border-ink-horizon/10 pl-3">
                <p className="text-ink-horizon">
                  <span className="capitalize">{h.action.replace(/^[a-z]+\./, "").replace(/[._]/g, " ")}</span>
                  <span className="text-ink/50"> by {who}</span>
                </p>
                {extra && <p className="text-xs text-ink/50">{extra}</p>}
                <p className="font-mono text-[11px] text-ink/40">{new Date(h.createdAt).toLocaleString()}</p>
              </li>
            );
          })}
        </ul>
      )}
      {pages > 1 && (
        <div className="mt-3 flex items-center justify-end gap-2 text-xs text-ink/50">
          <Btn disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Newer
          </Btn>
          <span>
            {page} / {pages}
          </span>
          <Btn disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
            Older
          </Btn>
        </div>
      )}
    </Card>
  );
}
