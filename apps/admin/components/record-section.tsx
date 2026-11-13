"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { createChild, deleteChild, listChildren, updateChild, type ChildName } from "@/lib/api";
import { getToken } from "@/lib/session";
import { Btn, Card, Modal, Notice, errMsg } from "@/components/detail-ui";
import { FieldInput, displayValue, initialValues, toPayload, type FieldDef, type FormValues } from "@/components/record-fields";

/**
 * A table of child records (prices, dates, rooms, vehicles...) with Add / Edit / Delete, driven entirely by a field list.
 * Used for everything that hangs off a listing, so each one looks and works the same.
 */
export function RecordSection({
  title,
  name,
  parentId,
  fields,
  canEdit,
  canCreate = true,
  canDelete = true,
  empty = "Nothing here yet.",
  hint,
  defaults,
  renderExtra,
}: {
  title: string;
  name: ChildName;
  parentId: string;
  fields: FieldDef[];
  canEdit: boolean;
  canCreate?: boolean;
  canDelete?: boolean;
  empty?: string;
  hint?: string;
  defaults?: Record<string, unknown>;
  /** Extra content under a row (for example the rooms inside a room type). */
  renderExtra?: (row: Record<string, any>) => ReactNode;
}) {
  const [rows, setRows] = useState<Record<string, any>[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ row?: Record<string, any> } | null>(null);
  const [values, setValues] = useState<FormValues>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    listChildren(getToken()!, name, parentId)
      .then(setRows)
      .catch((e) => {
        setRows([]);
        setError(errMsg(e, "Could not load this."));
      });
  }, [name, parentId]);

  useEffect(load, [load]);

  function open(row?: Record<string, any>) {
    setValues(initialValues(fields, row, defaults));
    setFormError(null);
    setEditing({ row });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      if (editing?.row) await updateChild(getToken()!, name, editing.row.id, toPayload(fields, values, "update"));
      else await createChild(getToken()!, name, parentId, toPayload(fields, values, "create"));
      setEditing(null);
      load();
    } catch (err) {
      setFormError(errMsg(err, "Could not save."));
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: Record<string, any>) {
    if (!window.confirm("Remove this?")) return;
    setError(null);
    try {
      await deleteChild(getToken()!, name, row.id);
      load();
    } catch (err) {
      setError(errMsg(err, "Could not remove."));
    }
  }

  const cols = fields.filter((f) => !f.hideInTable);
  const showActions = canEdit;

  return (
    <Card
      title={`${title}${rows ? ` (${rows.length})` : ""}`}
      actions={
        canEdit && canCreate ? (
          <Btn tone="primary" onClick={() => open()}>
            Add
          </Btn>
        ) : undefined
      }
    >
      {hint && <p className="mb-3 text-xs text-ink/50">{hint}</p>}
      {error && <Notice kind="error">{error}</Notice>}
      {rows === null && <p className="text-sm text-ink/50">Loading…</p>}
      {rows && rows.length === 0 && !error && <p className="text-sm text-ink/50">{empty}</p>}
      {rows && rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-ink-horizon/10 text-xs uppercase tracking-wide text-ink/40">
                {cols.map((f) => (
                  <th key={f.key} className="pb-2 pr-4 font-normal">
                    {f.label}
                  </th>
                ))}
                {showActions && <th className="pb-2" />}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <>
                  <tr key={row.id} className="border-b border-ink-horizon/5 align-top">
                    {cols.map((f) => (
                      <td key={f.key} className="py-2 pr-4 text-ink-horizon">
                        {displayValue(f, row[f.key])}
                      </td>
                    ))}
                    {showActions && (
                      <td className="py-2">
                        <div className="flex justify-end gap-2">
                          <Btn onClick={() => open(row)}>Edit</Btn>
                          {canDelete && (
                            <Btn tone="dangerOutline" onClick={() => remove(row)}>
                              Remove
                            </Btn>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                  {renderExtra && (
                    <tr key={`${row.id}-extra`}>
                      <td colSpan={cols.length + (showActions ? 1 : 0)} className="pb-4">
                        {renderExtra(row)}
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <Modal title={`${editing.row ? "Edit" : "Add"} ${title.toLowerCase()}`} onClose={() => setEditing(null)}>
          <form onSubmit={save} className="space-y-3">
            {formError && <Notice kind="error">{formError}</Notice>}
            {fields.filter((f) => !f.tableOnly).map((f) => (
              <FieldInput
                key={f.key}
                field={f}
                value={values[f.key] ?? ""}
                disabled={Boolean(editing.row && f.createOnly)}
                onChange={(v) => setValues((s) => ({ ...s, [f.key]: v }))}
              />
            ))}
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
    </Card>
  );
}
