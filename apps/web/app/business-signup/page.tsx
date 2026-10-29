"use client";

import { useState } from "react";
import Link from "next/link";
import { signUpBusiness } from "@/lib/api";
import { ApiError } from "@/lib/api-client";

// The platform this signup page belongs to. Defaults keep the original NaviMus wording; set these in the web
// app's environment to rebrand the page (see .env.example).
const PLATFORM_NAME = process.env.NEXT_PUBLIC_PLATFORM_NAME || "NaviMus";
const PLATFORM_DOMAIN = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN || "NaviMus.travel";

/**
 * A business creating its own account on the platform, not a customer
 * registering to book a trip (see /register for that). Hits
 * /api/v1/signup, a public endpoint - see lib/api.ts's signUpBusiness
 * doc comment for why it deliberately skips this app's usual tenant
 * resolution. New tenants start in "trial" status; there's no
 * auto-login afterward the way /register has, since the new owner
 * still needs to verify their email and log in through their own
 * tenant's storefront/dashboard once their tenant exists.
 */
export default function BusinessSignupPage() {
  const [form, setForm] = useState({
    name: "",
    slug: "",
    ownerFirstName: "",
    ownerLastName: "",
    ownerEmail: "",
    ownerPassword: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [created, setCreated] = useState<{ slug: string } | null>(null);

  function update(key: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [key]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const tenant = await signUpBusiness({
        name: form.name,
        slug: form.slug || undefined,
        ownerFirstName: form.ownerFirstName,
        ownerLastName: form.ownerLastName,
        ownerEmail: form.ownerEmail,
        ownerPassword: form.ownerPassword,
      });
      setCreated({ slug: tenant.slug });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (created) {
    return (
      <div className="mx-auto max-w-md px-6 py-20 text-center">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-gold-deep">You're in</p>
        <h1 className="mt-2 font-display text-3xl text-ink-horizon">Welcome to {PLATFORM_NAME}</h1>
        <p className="mt-4 text-ink/70">
          Your business is set up at <strong>{created.slug}</strong>. Check your email to verify your account, then
          sign in from your own dashboard to start adding destinations, packages, and staff.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-6 py-20">
      <p className="font-mono text-xs uppercase tracking-[0.3em] text-gold-deep">For businesses</p>
      <h1 className="mt-2 font-display text-4xl text-ink-horizon">Bring your business to {PLATFORM_NAME}</h1>
      <p className="mt-3 text-sm text-ink/60">
        Set up your own storefront, manage bookings, and onboard your operators - all under your own account.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-5">
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-ink/80">
            Business name
          </label>
          <input
            id="name"
            required
            value={form.name}
            onChange={update("name")}
            className="mt-1 w-full rounded-lg border border-ink-horizon/20 bg-sand-light px-4 py-2.5 text-ink focus-visible:border-gold"
          />
        </div>
        <div>
          <label htmlFor="slug" className="block text-sm font-medium text-ink/80">
            Storefront address (optional)
          </label>
          <div className="mt-1 flex items-center rounded-lg border border-ink-horizon/20 bg-sand-light px-4 py-2.5 text-ink/60 focus-within:border-gold">
            <input
              id="slug"
              value={form.slug}
              onChange={update("slug")}
              placeholder="your-business-name"
              className="flex-1 bg-transparent text-ink outline-none"
            />
            <span className="whitespace-nowrap text-xs text-ink/40">.{PLATFORM_DOMAIN}</span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="ownerFirstName" className="block text-sm font-medium text-ink/80">
              Your first name
            </label>
            <input
              id="ownerFirstName"
              required
              value={form.ownerFirstName}
              onChange={update("ownerFirstName")}
              className="mt-1 w-full rounded-lg border border-ink-horizon/20 bg-sand-light px-4 py-2.5 text-ink focus-visible:border-gold"
            />
          </div>
          <div>
            <label htmlFor="ownerLastName" className="block text-sm font-medium text-ink/80">
              Your last name
            </label>
            <input
              id="ownerLastName"
              required
              value={form.ownerLastName}
              onChange={update("ownerLastName")}
              className="mt-1 w-full rounded-lg border border-ink-horizon/20 bg-sand-light px-4 py-2.5 text-ink focus-visible:border-gold"
            />
          </div>
        </div>
        <div>
          <label htmlFor="ownerEmail" className="block text-sm font-medium text-ink/80">
            Your email
          </label>
          <input
            id="ownerEmail"
            type="email"
            required
            value={form.ownerEmail}
            onChange={update("ownerEmail")}
            className="mt-1 w-full rounded-lg border border-ink-horizon/20 bg-sand-light px-4 py-2.5 text-ink focus-visible:border-gold"
          />
        </div>
        <div>
          <label htmlFor="ownerPassword" className="block text-sm font-medium text-ink/80">
            Password
          </label>
          <input
            id="ownerPassword"
            type="password"
            required
            value={form.ownerPassword}
            onChange={update("ownerPassword")}
            className="mt-1 w-full rounded-lg border border-ink-horizon/20 bg-sand-light px-4 py-2.5 text-ink focus-visible:border-gold"
          />
        </div>

        {error && <p className="rounded-lg bg-plum/10 px-4 py-2 text-sm text-plum">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-full bg-acacia px-4 py-3 text-sm font-medium text-sand-light transition hover:bg-acacia/90 disabled:opacity-50"
        >
          {loading ? "Setting up your business…" : "Create my business account"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-ink/50">
        Looking to book a trip instead?{" "}
        <Link href="/register" className="text-acacia underline">
          Create a customer account
        </Link>
      </p>
    </div>
  );
}
