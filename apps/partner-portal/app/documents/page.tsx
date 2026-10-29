"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { getMyApprovedOperator, listMyDocuments, requestUploadUrl, submitDocument, type OperatorDocument } from "@/lib/api";
import { getToken, isLoggedIn } from "@/lib/session";
import { ApiError } from "@/lib/api-client";

const DOCUMENT_TYPES = ["business_license", "tax_certificate", "insurance", "id_verification", "other"];

const STATUS_STYLES: Record<OperatorDocument["status"], string> = {
  pending: "bg-gold/10 text-gold-deep",
  approved: "bg-acacia/10 text-acacia",
  rejected: "bg-plum/10 text-plum",
};

export default function DocumentsPage() {
  const [operatorId, setOperatorId] = useState<string | null>(null);
  const [documents, setDocuments] = useState<OperatorDocument[] | null>(null);
  const [documentType, setDocumentType] = useState(DOCUMENT_TYPES[0]);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [notOperator, setNotOperator] = useState(false);

  const load = useCallback(async () => {
    if (!isLoggedIn()) return;
    try {
      const operator = await getMyApprovedOperator(getToken()!);
      setOperatorId(operator.id);
      const docs = await listMyDocuments(getToken()!, operator.id);
      setDocuments(docs);
    } catch {
      setNotOperator(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !operatorId) return;
    setError(null);
    setUploading(true);
    try {
      const token = getToken()!;
      const { uploadUrl, storageKey } = await requestUploadUrl(token, {
        fileName: file.name,
        contentType: file.type || "application/octet-stream",
        sizeBytes: file.size,
      });
      // Direct PUT to the presigned URL, same as any other client upload
      // against a storage provider - the backend never sees the file
      // bytes, only the resulting storageKey.
      const putRes = await fetch(uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
      if (!putRes.ok) throw new Error("Upload to storage failed");
      const doc = await submitDocument(token, operatorId, { documentType, storageKey });
      setDocuments((prev) => [doc, ...(prev ?? [])]);
      setFile(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  if (!isLoggedIn()) {
    return (
      <div className="text-ink/60">
        <Link href="/login" className="text-acacia underline">
          Sign in
        </Link>{" "}
        to manage verification documents.
      </div>
    );
  }

  if (notOperator) {
    return (
      <div className="text-ink/60">
        You need an approved operator profile before uploading documents.{" "}
        <Link href="/register" className="text-acacia underline">
          Register as an operator
        </Link>
        .
      </div>
    );
  }

  return (
    <div>
      <p className="font-mono text-xs uppercase tracking-[0.3em] text-gold-deep">Verification</p>
      <h1 className="mt-2 font-display text-3xl text-ink-horizon">Documents</h1>
      <p className="mt-2 text-sm text-ink/60">
        Business license, tax certificate, insurance, and ID verification - required before your listings can go live.
      </p>

      <form onSubmit={handleUpload} className="mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-ink-horizon/10 bg-white p-5">
        <select value={documentType} onChange={(e) => setDocumentType(e.target.value)} className="rounded-lg border border-ink-horizon/20 px-3 py-2 text-sm">
          {DOCUMENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {t.replace(/_/g, " ")}
            </option>
          ))}
        </select>
        <input
          type="file"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="text-sm"
        />
        <button
          type="submit"
          disabled={!file || uploading}
          className="rounded-full bg-ink-horizon px-5 py-2 text-sm font-medium text-sand-light hover:bg-acacia disabled:opacity-50"
        >
          {uploading ? "Uploading…" : "Upload"}
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-plum">{error}</p>}

      {documents === null && <p className="mt-8 text-ink/50">Loading…</p>}
      {documents && documents.length === 0 && <p className="mt-8 text-ink/50">No documents submitted yet.</p>}

      <ul className="mt-6 divide-y divide-ink-horizon/10 text-sm">
        {documents?.map((d) => (
          <li key={d.id} className="flex items-center justify-between py-3">
            <span className="capitalize">{d.documentType.replace(/_/g, " ")}</span>
            <span className={`rounded-full px-2.5 py-0.5 text-xs ${STATUS_STYLES[d.status]}`}>{d.status}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
