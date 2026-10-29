"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SearchBar() {
  const router = useRouter();
  const [query, setQuery] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = query.trim();
    router.push(trimmed ? `/packages?q=${encodeURIComponent(trimmed)}` : "/packages");
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex w-full max-w-md items-center gap-2 rounded-full bg-sand-light p-1.5 shadow-card"
    >
      <svg
        className="ml-3 shrink-0 text-ink/40"
        width="18"
        height="18"
        viewBox="0 0 18 18"
        fill="none"
        aria-hidden="true"
      >
        <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.6" />
        <path d="M12.5 12.5L17 17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      <label htmlFor="hero-search" className="sr-only">
        Search destinations or packages
      </label>
      <input
        id="hero-search"
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search “Maasai Mara”, “Diani beach”…"
        className="w-full bg-transparent py-2.5 font-body text-sm text-ink placeholder:text-ink/40 focus:outline-none"
      />
      <button
        type="submit"
        className="shrink-0 rounded-full bg-ink-horizon px-5 py-2.5 font-body text-sm font-semibold text-sand-light transition hover:bg-acacia"
      >
        Search
      </button>
    </form>
  );
}
