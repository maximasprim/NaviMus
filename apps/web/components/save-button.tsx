"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getToken } from "@/lib/session";
import { listMyFavorites, addFavorite, removeFavorite, type Favorite } from "@/lib/api";

/**
 * Section 30 (customer dashboard: wishlist). Dropped into destination/
 * package detail pages, which are server components - this is the
 * client-side leaf that actually talks to auth state and the
 * favorites API. Silently shows a "sign in to save" link rather than
 * hiding itself for a signed-out visitor, so the wishlist feature is
 * discoverable rather than invisible.
 */
export function SaveButton({ subjectType, subjectId }: { subjectType: Favorite["subjectType"]; subjectId: string }) {
  const [loggedIn, setLoggedIn] = useState(false);
  const [saved, setSaved] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setChecking(false);
      return;
    }
    setLoggedIn(true);
    listMyFavorites(token)
      .then((favorites) => setSaved(favorites.some((f) => f.subjectType === subjectType && f.subjectId === subjectId)))
      .finally(() => setChecking(false));
  }, [subjectType, subjectId]);

  async function toggle() {
    const token = getToken();
    if (!token) return;
    if (saved) {
      await removeFavorite(token, subjectType, subjectId);
      setSaved(false);
    } else {
      await addFavorite(token, subjectType, subjectId);
      setSaved(true);
    }
  }

  if (checking) return null;

  if (!loggedIn) {
    return (
      <Link href="/login" className="text-sm text-ink/50 underline">
        Sign in to save
      </Link>
    );
  }

  return (
    <button
      onClick={toggle}
      className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
        saved ? "border-acacia bg-acacia/10 text-acacia" : "border-ink-horizon/20 text-ink/70 hover:border-acacia"
      }`}
    >
      {saved ? "★ Saved" : "☆ Save"}
    </button>
  );
}
