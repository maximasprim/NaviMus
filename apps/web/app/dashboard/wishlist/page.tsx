"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getToken } from "@/lib/session";
import { listMyFavorites, removeFavorite, type Favorite } from "@/lib/api";
import { apiFetch } from "@/lib/api-client";

interface HydratedFavorite extends Favorite {
  name?: string;
  slug?: string;
}

export default function WishlistPage() {
  const router = useRouter();
  const [items, setItems] = useState<HydratedFavorite[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.push("/login");
      return;
    }
    listMyFavorites(token).then(async (favorites) => {
      // Favorites only store {subjectType, subjectId} - hydrate display
      // name/slug per item from its owning service. A subject that's
      // since been removed/unpublished is silently skipped rather than
      // shown as a broken card.
      const hydrated = await Promise.all(
        favorites.map(async (f) => {
          try {
            const path = f.subjectType === "destination" ? "destinations" : f.subjectType === "package" ? "packages" : "accommodations";
            const { data } = await apiFetch<{ name: string; slug?: string }>(`/api/v1/${path}/${f.subjectId}`);
            return { ...f, name: data.name, slug: (data as any).slug };
          } catch {
            return { ...f, name: undefined };
          }
        })
      );
      setItems(hydrated);
      setLoading(false);
    });
  }, [router]);

  async function handleRemove(item: Favorite) {
    const token = getToken();
    if (!token) return;
    await removeFavorite(token, item.subjectType, item.subjectId);
    setItems((prev) => prev.filter((i) => i.id !== item.id));
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <Link href="/dashboard" className="text-sm text-acacia underline">
        ← Back to account
      </Link>
      <h1 className="mt-4 font-display text-3xl text-ink-horizon">Wishlist</h1>

      {loading && <p className="mt-8 text-ink/50">Loading…</p>}
      {!loading && items.length === 0 && (
        <p className="mt-8 text-ink/50">
          Nothing saved yet - look for the save icon on{" "}
          <Link href="/destinations" className="text-acacia underline">
            destinations
          </Link>{" "}
          and{" "}
          <Link href="/packages" className="text-acacia underline">
            packages
          </Link>
          .
        </p>
      )}

      <ul className="mt-6 divide-y divide-ink-horizon/10">
        {items.map((item) => (
          <li key={item.id} className="flex items-center justify-between py-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-ink/40">{item.subjectType}</p>
              {item.name ? (
                <Link
                  href={item.slug ? `/${item.subjectType === "destination" ? "destinations" : "packages"}/${item.slug}` : "#"}
                  className="font-medium text-ink-horizon hover:text-acacia"
                >
                  {item.name}
                </Link>
              ) : (
                <p className="font-medium text-ink/40">No longer available</p>
              )}
            </div>
            <button onClick={() => handleRemove(item)} className="text-sm text-plum underline">
              Remove
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
