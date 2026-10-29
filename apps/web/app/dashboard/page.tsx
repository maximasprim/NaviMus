"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getToken } from "@/lib/session";
import { getCurrentUser, resendVerificationEmail, type CurrentUser } from "@/lib/api";
import { ApiError } from "@/lib/api-client";

const LINKS = [
  { href: "/bookings", label: "My trips", description: "Upcoming and past bookings" },
  { href: "/dashboard/notifications", label: "Notifications", description: "Booking, payment, and trip updates" },
  { href: "/dashboard/wishlist", label: "Wishlist", description: "Destinations and packages you've saved" },
  { href: "/dashboard/invoices", label: "Invoices", description: "Download receipts for past payments" },
  { href: "/dashboard/travelers", label: "Travelers", description: "Saved traveler profiles for faster checkout" },
  { href: "/dashboard/reviews", label: "My reviews", description: "Reviews you've left on trips" },
  { href: "/dashboard/support", label: "Support", description: "Open tickets and message our team" },
];

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [resendStatus, setResendStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.push("/login");
      return;
    }
    getCurrentUser(token)
      .then(setUser)
      .catch(() => router.push("/login"))
      .finally(() => setLoading(false));
  }, [router]);

  async function handleResendVerification() {
    const token = getToken();
    if (!token) return;
    try {
      const result = await resendVerificationEmail(token);
      setResendStatus(result.message);
    } catch (err) {
      setResendStatus(err instanceof ApiError ? err.message : "Couldn't send that - try again shortly.");
    }
  }

  if (loading) {
    return <div className="mx-auto max-w-4xl px-6 py-20 text-ink/50">Loading…</div>;
  }
  if (!user) return null;

  return (
    <div>
      <div className="bg-horizon-fade py-16">
        <div className="mx-auto max-w-4xl px-6">
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-gold">Account</p>
          <h1 className="mt-2 font-display text-4xl text-sand-light">
            Welcome back, {user.firstName}
          </h1>
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-6 py-12">
        {!user.emailVerifiedAt && (
          <div className="mb-8 flex items-center justify-between rounded-2xl bg-gold/10 px-5 py-4">
            <p className="text-sm text-ink/80">Your email address isn't verified yet.</p>
            <button onClick={handleResendVerification} className="text-sm font-medium text-acacia underline">
              Resend verification email
            </button>
          </div>
        )}
        {resendStatus && <p className="mb-6 text-sm text-ink/60">{resendStatus}</p>}

        <div className="grid gap-4 sm:grid-cols-2">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-2xl border border-ink-horizon/15 p-6 transition hover:border-acacia hover:shadow-sm"
            >
              <p className="font-display text-lg text-ink-horizon">{link.label}</p>
              <p className="mt-1 text-sm text-ink/60">{link.description}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
