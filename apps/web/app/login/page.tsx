"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { login } from "@/lib/api";
import { setToken } from "@/lib/session";
import { ApiError } from "@/lib/api-client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login({ email, password });
      setToken(); // the API has set the httpOnly session cookies; this only records "signed in" for the UI
      router.push("/bookings");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-md px-6 py-20">
      <p className="font-mono text-xs uppercase tracking-[0.3em] text-gold-deep">Welcome back</p>
      <h1 className="mt-2 font-display text-4xl text-ink-horizon">Sign in</h1>

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
        <div>
          <div className="flex items-center justify-between">
            <label htmlFor="password" className="block text-sm font-medium text-ink/80">
              Password
            </label>
            <Link href="/forgot-password" className="text-xs text-acacia underline">
              Forgot password?
            </Link>
          </div>
          <input
            id="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
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
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <p className="mt-6 text-sm text-ink/60">
        New here?{" "}
        <Link href="/register" className="text-acacia underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}
