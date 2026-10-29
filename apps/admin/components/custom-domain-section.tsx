"use client";

import { useState } from "react";
import { requestCustomDomain, verifyCustomDomain, removeCustomDomain, type DomainStatus } from "@/lib/api";
import { getToken } from "@/lib/session";

/**
 * Self-service custom domain setup for the currently-managed tenant
 * (see lib/tenant-session.ts - every call here is scoped to whichever
 * tenant is selected). Ownership is proven via a real DNS TXT record
 * lookup on the backend (services/admin/src/domain-verification.ts),
 * not a rubber-stamp - "Check now" can be clicked repeatedly while
 * DNS propagates.
 */
export function CustomDomainSection() {
  const [domain, setDomain] = useState("");
  const [status, setStatus] = useState<DomainStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleRequest(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const result = await requestCustomDomain(getToken()!, domain);
      setStatus(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save that domain.");
    } finally {
      setBusy(false);
    }
  }

  async function handleVerify() {
    setBusy(true);
    setError(null);
    try {
      const result = await verifyCustomDomain(getToken()!);
      setStatus((prev) => (prev ? { ...prev, verified: result.verified } : { domain: result.domain, verified: result.verified }));
      if (!result.verified) {
        setError("DNS record not found yet - this can take a few minutes to propagate. Try again shortly.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not check verification status.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    setBusy(true);
    setError(null);
    try {
      await removeCustomDomain(getToken()!);
      setStatus(null);
      setDomain("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove the domain.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-ink-horizon/10 bg-white p-6">
      <h2 className="font-display text-lg text-ink-horizon">Custom domain</h2>
      <p className="mt-1 text-sm text-ink/60">
        Serve your storefront from your own domain instead of your NaviMus subdomain.
      </p>

      {error && <p className="mt-3 rounded-lg bg-plum/10 px-3 py-2 text-sm text-plum">{error}</p>}

      {!status ? (
        <form onSubmit={handleRequest} className="mt-4 flex gap-2">
          <input
            required
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="acmetravel.com"
            className="flex-1 rounded-lg border border-ink-horizon/20 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={busy}
            className="rounded-full bg-ink-horizon px-5 py-2 text-sm font-medium text-sand-light hover:bg-acacia disabled:opacity-50"
          >
            {busy ? "Saving…" : "Use this domain"}
          </button>
        </form>
      ) : (
        <div className="mt-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm text-ink-horizon">{status.domain}</span>
            <span className={`rounded-full px-2 py-0.5 text-xs ${status.verified ? "bg-acacia/10 text-acacia" : "bg-gold/10 text-gold-deep"}`}>
              {status.verified ? "Verified" : "Pending verification"}
            </span>
          </div>

          {!status.verified && status.dnsRecord && (
            <div className="rounded-lg bg-ink-horizon/[0.03] p-4 text-sm">
              <p className="text-ink/70">Add this DNS record at your domain provider, then check again:</p>
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 font-mono text-xs">
                <dt className="text-ink/40">Type</dt>
                <dd>{status.dnsRecord.type}</dd>
                <dt className="text-ink/40">Name</dt>
                <dd className="break-all">{status.dnsRecord.name}</dd>
                <dt className="text-ink/40">Value</dt>
                <dd className="break-all">{status.dnsRecord.value}</dd>
              </dl>
            </div>
          )}

          <div className="flex gap-2">
            {!status.verified && (
              <button
                onClick={handleVerify}
                disabled={busy}
                className="rounded-full bg-ink-horizon px-4 py-1.5 text-xs font-medium text-sand-light hover:bg-acacia disabled:opacity-50"
              >
                {busy ? "Checking…" : "Check now"}
              </button>
            )}
            <button
              onClick={handleRemove}
              disabled={busy}
              className="rounded-full border border-plum/30 px-4 py-1.5 text-xs font-medium text-plum hover:bg-plum/10 disabled:opacity-50"
            >
              Remove domain
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
