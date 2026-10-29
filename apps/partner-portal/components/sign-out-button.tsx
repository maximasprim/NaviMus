"use client";

import { useState } from "react";
import { logout } from "@/lib/api";

/** Ends the session on the server (revoking it, not just forgetting it locally), then returns to the login page. */
export function SignOutButton({ className = "hover:text-ink" }: { className?: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className={className}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await logout();
        window.location.assign("/login");
      }}
    >
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
