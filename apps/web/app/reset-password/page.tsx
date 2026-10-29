"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { resetPassword } from "@/lib/api";
import { ApiError } from "@/lib/api-client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPassword !== confirmPassword) {
      setError("Passwords don't match");
      return;
    }
    setLoading(true);
    try {
      await resetPassword(token, newPassword);
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="mx-auto max-w-md px-6 py-20">
        <h1 className="font-display text-3xl text-ink-horizon">Missing reset link</h1>
        <p className="mt-4 text-ink/70">
          This page needs a reset token from the link in your email.{" "}
          <Link href="/forgot-password" className="text-acacia underline">
            Request a new one
          </Link>
          .
        </p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="mx-auto max-w-md px-6 py-20">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-gold-deep">Done</p>
        <h1 className="mt-2 font-display text-4xl text-ink-horizon">Password updated</h1>
        <p className="mt-4 text-ink/70">You can now sign in with your new password.</p>
        <Link
          href="/login"
          className="mt-6 inline-block rounded-full bg-ink-horizon px-6 py-3 font-body text-sm font-semibold text-sand-light transition hover:bg-acacia"
        >
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-6 py-20">
      <p className="font-mono text-xs uppercase tracking-[0.3em] text-gold-deep">Reset password</p>
      <h1 className="mt-2 font-display text-4xl text-ink-horizon">Choose a new password</h1>

      <form onSubmit={handleSubmit} className="mt-8 space-y-5">
        <div>
          <label htmlFor="newPassword" className="block text-sm font-medium text-ink/80">
            New password
          </label>
          <input
            id="newPassword"
            type="password"
            required
            minLength={8}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="mt-1 w-full rounded-lg border border-ink-horizon/20 bg-sand-light px-4 py-2.5 text-ink focus-visible:border-gold"
          />
        </div>
        <div>
          <label htmlFor="confirmPassword" className="block text-sm font-medium text-ink/80">
            Confirm new password
          </label>
          <input
            id="confirmPassword"
            type="password"
            required
            minLength={8}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="mt-1 w-full rounded-lg border border-ink-horizon/20 bg-sand-light px-4 py-2.5 text-ink focus-visible:border-gold"
          />
        </div>

        {error && (
          <p role="alert" className="rounded-lg bg-plum/10 px-4 py-3 text-sm text-plum">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-full bg-ink-horizon px-6 py-3 font-body text-sm font-semibold text-sand-light transition hover:bg-acacia disabled:opacity-50"
        >
          {loading ? "Updating…" : "Update password"}
        </button>
      </form>
    </div>
  );
}
