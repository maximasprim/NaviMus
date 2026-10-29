"use client";

import { useState } from "react";
import Link from "next/link";
import { requestPasswordReset } from "@/lib/api";
import { ApiError } from "@/lib/api-client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      // The API always returns 200 here regardless of whether the email
      // exists - see AuthService.requestPasswordReset's doc comment. The
      // frontend mirrors that by always showing the same confirmation.
      await requestPasswordReset(email);
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="mx-auto max-w-md px-6 py-20">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-gold-deep">Check your email</p>
        <h1 className="mt-2 font-display text-4xl text-ink-horizon">Reset link sent</h1>
        <p className="mt-4 text-ink/70">
          If an account exists for <span className="font-medium">{email}</span>, we've sent a link to reset your
          password. It expires in 1 hour.
        </p>
        <Link href="/login" className="mt-6 inline-block text-sm text-acacia underline">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-6 py-20">
      <p className="font-mono text-xs uppercase tracking-[0.3em] text-gold-deep">Reset password</p>
      <h1 className="mt-2 font-display text-4xl text-ink-horizon">Forgot your password?</h1>
      <p className="mt-3 text-sm text-ink/60">Enter your email and we'll send you a reset link.</p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-5">
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
          {loading ? "Sending…" : "Send reset link"}
        </button>
      </form>

      <p className="mt-6 text-sm text-ink/60">
        Remembered it?{" "}
        <Link href="/login" className="text-acacia underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
