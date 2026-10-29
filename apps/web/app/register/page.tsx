"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { register, login } from "@/lib/api";
import { setToken } from "@/lib/session";
import { ApiError } from "@/lib/api-client";

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function update(key: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [key]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await register(form);
      // Registration doesn't return tokens - sign the new user in immediately
      // so they land in a logged-in state without a second manual step.
      await login({ email: form.email, password: form.password });
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
      <p className="font-mono text-xs uppercase tracking-[0.3em] text-gold-deep">Get started</p>
      <h1 className="mt-2 font-display text-4xl text-ink-horizon">Create your account</h1>

      <form onSubmit={handleSubmit} className="mt-8 space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="firstName" className="block text-sm font-medium text-ink/80">
              First name
            </label>
            <input
              id="firstName"
              required
              value={form.firstName}
              onChange={update("firstName")}
              className="mt-1 w-full rounded-lg border border-ink-horizon/20 bg-sand-light px-4 py-2.5 text-ink focus-visible:border-gold"
            />
          </div>
          <div>
            <label htmlFor="lastName" className="block text-sm font-medium text-ink/80">
              Last name
            </label>
            <input
              id="lastName"
              required
              value={form.lastName}
              onChange={update("lastName")}
              className="mt-1 w-full rounded-lg border border-ink-horizon/20 bg-sand-light px-4 py-2.5 text-ink focus-visible:border-gold"
            />
          </div>
        </div>
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-ink/80">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            value={form.email}
            onChange={update("email")}
            className="mt-1 w-full rounded-lg border border-ink-horizon/20 bg-sand-light px-4 py-2.5 text-ink focus-visible:border-gold"
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
            minLength={10}
            value={form.password}
            onChange={update("password")}
            className="mt-1 w-full rounded-lg border border-ink-horizon/20 bg-sand-light px-4 py-2.5 text-ink focus-visible:border-gold"
          />
          <p className="mt-1 text-xs text-ink/40">At least 10 characters, with upper, lower, and a number.</p>
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
          {loading ? "Creating account…" : "Create account"}
        </button>
      </form>

      <p className="mt-6 text-sm text-ink/60">
        Already have an account?{" "}
        <Link href="/login" className="text-acacia underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
