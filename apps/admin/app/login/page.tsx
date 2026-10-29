"use client";

import { useEffect, useState } from "react";
import { login } from "@/lib/api";
import { clearToken, setToken } from "@/lib/session";
import { getLastWorkspace, setWorkspace } from "@/lib/session-core";
import { clearSelectedTenant } from "@/lib/tenant-session";
import { ApiError } from "@/lib/api-client";
import { safeNextPath } from "@/lib/auth-redirect";

export default function AdminLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
    // Which tenant the account belongs to. Platform staff use the default; tenant admins type their own slug.
  const [workspace, setWorkspaceInput] = useState(process.env.NEXT_PUBLIC_DEV_TENANT_SLUG ?? "default");

  // Pre-fill with the workspace used last time (read after mount: localStorage doesn't exist on the server).
  useEffect(() => {
    const last = getLastWorkspace();
    if (last) setWorkspaceInput(last);
  }, []);

  // Sent here because the session ended: make sure nothing still claims we're signed in, and say why.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("expired") === "1") {
      clearToken();
      setNotice(
        new URLSearchParams(window.location.search).get("reason") === "tenant"
          ? "Your session didn't match the workspace you were viewing. Please sign in again with the right workspace."
          : "Your session has expired. Please sign in again."
      );
    }
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login({ email, password, workspace });
      clearSelectedTenant(); // a fresh sign-in starts with no leftover "currently viewing" tenant
      setWorkspace(workspace.trim().toLowerCase()); // every later call must name the same tenant
      setToken(); // the API has set the httpOnly session cookies; this only records "signed in" for the UI
      // Full navigation (not router.push) so the freshly signed-in session is what the server sees; the button
      // stays disabled until the page changes.
      window.location.assign(safeNextPath(new URLSearchParams(window.location.search).get("next")));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Sign-in failed.");
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm px-6 py-24">
      <p className="font-mono text-xs uppercase tracking-[0.3em] text-gold-deep">Internal access</p>
      <h1 className="mt-2 font-display text-3xl text-ink-horizon">Admin sign in</h1>

      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
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
            className="mt-1 w-full rounded-lg border border-ink-horizon/20 bg-white px-3 py-2 text-sm text-ink focus-visible:border-gold"
          />
          <p className="mt-1 text-xs text-ink/50">
            Platform staff: <span className="font-mono">default</span>. Tenant admins: your tenant&apos;s slug, e.g.{" "}
            <span className="font-mono">acme-travel-demo</span>.
          </p>
        </div>
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

      <p className="mt-6 text-xs text-ink/40">
        Requires an account with an admin or super_admin role.
      </p>
    </div>
  );
}
