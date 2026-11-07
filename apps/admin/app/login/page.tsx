"use client";

import { useEffect, useState } from "react";
import { login } from "@/lib/api";
import { clearToken, setToken } from "@/lib/session";
import { setWorkspace, setIsPlatformAdmin } from "@/lib/session-core";
import { clearSelectedTenant } from "@/lib/tenant-session";
import { ApiError } from "@/lib/api-client";
import { safeNextPath } from "@/lib/auth-redirect";

export default function AdminLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // Normally the server works out which tenant the account belongs to. This field only appears in the rare case
  // the API says one email manages several workspaces and asks which one to open (code WORKSPACE_REQUIRED).
  const [needWorkspace, setNeedWorkspace] = useState(false);
  const [workspace, setWorkspaceInput] = useState("");

  // Sent here because the session ended: make sure nothing still claims we're signed in, and say why.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("expired") === "1") {
      clearToken();
      setNotice(
        new URLSearchParams(window.location.search).get("reason") === "tenant"
          ? "Your session didn't match the workspace you were viewing. Please sign in again."
          : "Your session has expired. Please sign in again."
      );
    }
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const who = await login({ email, password, workspace: needWorkspace ? workspace : undefined });
      clearSelectedTenant(); // a fresh sign-in starts with no leftover "currently viewing" tenant
      setWorkspace(who.tenant.slug); // the tenant the server says this account belongs to; later calls name it
      setToken(); // the API has set the httpOnly session cookies; this only records "signed in" for the UI
      setIsPlatformAdmin(who.isPlatformAdmin);
      // Send each kind of admin to their own starting point: a platform admin manages tenants, a tenant admin
      // lands on their own business. A deep link (?next=) still wins. Full navigation (not router.push) so the
      // freshly signed-in session is what the server sees; the button stays disabled until the page changes.
      const home = who.isPlatformAdmin ? "/tenants" : "/";
      window.location.assign(safeNextPath(new URLSearchParams(window.location.search).get("next"), home));
    } catch (err) {
      if (err instanceof ApiError && err.code === "WORKSPACE_REQUIRED") setNeedWorkspace(true);
      setError(err instanceof ApiError ? err.message : "Sign-in failed.");
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm px-6 py-24">
      <p className="font-mono text-xs uppercase tracking-[0.3em] text-gold-deep">Internal access</p>
      <h1 className="mt-1 font-display text-3xl text-ink-horizon">Admin sign in</h1>

      <form onSubmit={handleSubmit} className="mt-4 space-y-2">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-ink/80">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-lg border border-ink-horizon/20 bg-white px-3 py-2 text-sm text-ink focus-visible:border-gold"
          />
        </div>
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-ink/80">
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-lg border border-ink-horizon/20 bg-white px-3 py-2 text-sm text-ink focus-visible:border-gold"
          />
        </div>

        {needWorkspace && (
          <div>
            <label htmlFor="workspace" className="block text-sm font-medium text-ink/80">
              Workspace
            </label>
            <input
              id="workspace"
              type="text"
              required
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={workspace}
              onChange={(e) => setWorkspaceInput(e.target.value)}
              placeholder="e.g. enroute-travel-demo"
              className="mt-1 w-full rounded-lg border border-ink-horizon/20 bg-white px-3 py-2 text-sm text-ink focus-visible:border-gold"
            />
          </div>
        )}

        {notice && !error && (
          <p role="status" className="rounded-lg bg-gold/10 px-3 py-2 text-sm text-ink">
            {notice}
          </p>
        )}

        {error && (
          <p role="alert" className="rounded-lg bg-plum/10 px-3 py-2 text-sm text-plum">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-ink-horizon px-4 py-2.5 text-sm font-semibold text-sand-light transition hover:bg-acacia disabled:opacity-50"
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>

      {/* <p className="mt-6 text-xs text-ink/40">
        Requires an account with an admin or super_admin role.
      </p> */}
    </div>
  );
}
