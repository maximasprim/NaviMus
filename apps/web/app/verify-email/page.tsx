"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { verifyEmail } from "@/lib/api";
import { ApiError } from "@/lib/api-client";

export default function VerifyEmailPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [status, setStatus] = useState<"pending" | "success" | "error">("pending");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setError("This link is missing a verification token.");
      return;
    }
    verifyEmail(token)
      .then(() => setStatus("success"))
      .catch((err) => {
        setStatus("error");
        setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
      });
  }, [token]);

  return (
    <div className="mx-auto max-w-md px-6 py-20 text-center">
      {status === "pending" && (
        <>
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-gold-deep">One moment</p>
          <h1 className="mt-2 font-display text-3xl text-ink-horizon">Verifying your email…</h1>
        </>
      )}
      {status === "success" && (
        <>
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-gold-deep">Verified</p>
          <h1 className="mt-2 font-display text-4xl text-ink-horizon">Email confirmed</h1>
          <p className="mt-4 text-ink/70">Your email address is now verified.</p>
          <Link
            href="/login"
            className="mt-6 inline-block rounded-full bg-ink-horizon px-6 py-3 font-body text-sm font-semibold text-sand-light transition hover:bg-acacia"
          >
            Sign in
          </Link>
        </>
      )}
      {status === "error" && (
        <>
          <h1 className="font-display text-3xl text-ink-horizon">Verification failed</h1>
          <p className="mt-4 text-ink/70">{error}</p>
          <p className="mt-4 text-sm text-ink/60">
            You can request a new link from your{" "}
            <Link href="/dashboard" className="text-acacia underline">
              account dashboard
            </Link>
            .
          </p>
        </>
      )}
    </div>
  );
}
