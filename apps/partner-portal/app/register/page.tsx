"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { registerUser, login, registerOperator } from "@/lib/api";
import { setToken, getToken } from "@/lib/session";
import { ApiError } from "@/lib/api-client";

export default function RegisterPage() {
  const router = useRouter();
  const [step, setStep] = useState<"account" | "business">("account");
  const [account, setAccount] = useState({ firstName: "", lastName: "", email: "", password: "" });
  const [business, setBusiness] = useState({ businessName: "", contactEmail: "", contactPhone: "", description: "" });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function updateAccount(key: keyof typeof account) {
    return (e: React.ChangeEvent<HTMLInputElement>) => setAccount((a) => ({ ...a, [key]: e.target.value }));
  }
  function updateBusiness(key: keyof typeof business) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setBusiness((b) => ({ ...b, [key]: e.target.value }));
  }

  async function handleAccountSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await registerUser(account);
      await login({ email: account.email, password: account.password });
      setToken(); // the API has set the httpOnly session cookies; this only records "signed in" for the UI
      // Pre-fill the business contact email with the account email - most
      // partners use the same address for both, and it's easy to change.
      setBusiness((b) => ({ ...b, contactEmail: account.email }));
      setStep("business");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create your account.");
    } finally {
      setLoading(false);
    }
  }

  async function handleBusinessSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const token = getToken()!;
      await registerOperator(token, business);
      router.push("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not register your business.");
    } finally {
      setLoading(false);
    }
  }

  if (step === "business") {
    return (
      <div className="mx-auto max-w-md py-10">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-gold-deep">Step 2 of 2</p>
        <h1 className="mt-2 font-display text-3xl text-ink-horizon">Tell us about your business</h1>
        <p className="mt-2 text-sm text-ink/60">
          An admin reviews every new partner before you can publish listings.
        </p>

        <form onSubmit={handleBusinessSubmit} className="mt-8 space-y-4">
          <div>
            <label htmlFor="businessName" className="block text-sm font-medium text-ink/80">
              Business name
            </label>
            <input
              id="businessName"
              required
              value={business.businessName}
              onChange={updateBusiness("businessName")}
              className="mt-1 w-full rounded-lg border border-ink-horizon/20 bg-white px-3 py-2 text-sm text-ink focus-visible:border-gold"
            />
          </div>
          <div>
            <label htmlFor="contactEmail" className="block text-sm font-medium text-ink/80">
              Contact email
            </label>
            <input
              id="contactEmail"
              type="email"
              required
              value={business.contactEmail}
              onChange={updateBusiness("contactEmail")}
              className="mt-1 w-full rounded-lg border border-ink-horizon/20 bg-white px-3 py-2 text-sm text-ink focus-visible:border-gold"
            />
          </div>
          <div>
            <label htmlFor="contactPhone" className="block text-sm font-medium text-ink/80">
              Contact phone (optional)
            </label>
            <input
              id="contactPhone"
              type="tel"
              value={business.contactPhone}
              onChange={updateBusiness("contactPhone")}
              className="mt-1 w-full rounded-lg border border-ink-horizon/20 bg-white px-3 py-2 text-sm text-ink focus-visible:border-gold"
            />
          </div>
          <div>
            <label htmlFor="description" className="block text-sm font-medium text-ink/80">
              About your business (optional)
            </label>
            <textarea
              id="description"
              rows={3}
              value={business.description}
              onChange={updateBusiness("description")}
              className="mt-1 w-full rounded-lg border border-ink-horizon/20 bg-white px-3 py-2 text-sm text-ink focus-visible:border-gold"
            />
          </div>

          {error && (
            <p role="alert" className="rounded-lg bg-plum/10 px-3 py-2 text-sm text-plum">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-gold px-4 py-2.5 text-sm font-semibold text-ink-horizon transition hover:bg-gold-soft disabled:opacity-50"
          >
            {loading ? "Submitting…" : "Submit for review"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-sm py-10">
      <p className="font-mono text-xs uppercase tracking-[0.3em] text-gold-deep">Step 1 of 2</p>
      <h1 className="mt-2 font-display text-3xl text-ink-horizon">Create your account</h1>

      <form onSubmit={handleAccountSubmit} className="mt-8 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="firstName" className="block text-sm font-medium text-ink/80">
              First name
            </label>
            <input
              id="firstName"
              required
              value={account.firstName}
              onChange={updateAccount("firstName")}
              className="mt-1 w-full rounded-lg border border-ink-horizon/20 bg-white px-3 py-2 text-sm text-ink focus-visible:border-gold"
            />
          </div>
          <div>
            <label htmlFor="lastName" className="block text-sm font-medium text-ink/80">
              Last name
            </label>
            <input
              id="lastName"
              required
              value={account.lastName}
              onChange={updateAccount("lastName")}
              className="mt-1 w-full rounded-lg border border-ink-horizon/20 bg-white px-3 py-2 text-sm text-ink focus-visible:border-gold"
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
            value={account.email}
            onChange={updateAccount("email")}
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
            minLength={10}
            value={account.password}
            onChange={updateAccount("password")}
            className="mt-1 w-full rounded-lg border border-ink-horizon/20 bg-white px-3 py-2 text-sm text-ink focus-visible:border-gold"
          />
        </div>

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
          {loading ? "Creating account…" : "Continue"}
        </button>
      </form>

      <p className="mt-6 text-sm text-ink/60">
        Already registered?{" "}
        <Link href="/login" className="text-acacia underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
