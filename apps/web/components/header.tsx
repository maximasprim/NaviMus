"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isLoggedIn } from "@/lib/session";
import { logout } from "@/lib/api";

import { DEFAULT_NAV_LINKS } from "@/lib/site-theme";

const NAV_LINKS: Array<{ href: string; label: string }> = DEFAULT_NAV_LINKS.map((l) => ({ href: l.href, label: l.label }));

interface HeaderProps {
  /** From the tenant's saved site content (Admin -> Site content -> Brand & SEO). */
  siteName?: string;
  tagline?: string;
  logoUrl?: string;
  /** The tenant's own menu (Admin -> Site content -> Menu & footer). Omitted = the built-in three links. */
  links?: Array<{ href: string; label: string }>;
  /** About / Contact, once the tenant has filled them in. */
  extraLinks?: Array<{ href: string; label: string }>;
}

export function Header({ siteName = "NaviMus", tagline = "Trips & Trails", logoUrl = "", links, extraLinks = [] }: HeaderProps) {
  const navLinks = [...(links ?? NAV_LINKS), ...extraLinks];
  const router = useRouter();
  // Read auth state client-side only - avoids a server/client markup
  // mismatch, since the token lives in localStorage which the server
  // render has no access to.
  const [loggedIn, setLoggedIn] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setLoggedIn(isLoggedIn());
  }, []);

  async function handleSignOut() {
    await logout(); // revokes the session server-side, then clears the signed-in marker
    setLoggedIn(false);
    setMenuOpen(false);
    router.push("/");
  }

  return (
    <header className="sticky top-0 z-40 border-b border-ink-horizon/10 bg-sand-light/90 backdrop-blur">
      <div className="mx-auto flex max-w-8xl items-center justify-between px-3 py-4">
        <Link href="/" className="flex items-baseline gap-2" onClick={() => setMenuOpen(false)}>
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- tenant-supplied https URL
            <img src={logoUrl} alt={siteName} className="h-8 w-auto" />
          ) : (
            <span className="font-display text-2xl tracking-tight text-ink-horizon">{siteName}</span>
          )}
          {tagline && (
            <span className="hidden font-mono text-[10px] uppercase tracking-[0.2em] text-gold-deep sm:inline">{tagline}</span>
          )}
        </Link>

        <nav className="hidden items-center gap-8 font-body text-sm text-ink/80 md:flex">
          {navLinks.map((link) => (
            <Link key={`${link.href}-${link.label}`} href={link.href} className="transition hover:text-acacia">
              {link.label}
            </Link>
          ))}
          {loggedIn && (
            <Link href="/dashboard" className="transition hover:text-acacia">
              Dashboard
            </Link>
          )}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          {loggedIn ? (
            <button onClick={handleSignOut} className="font-body text-sm text-ink/80 hover:text-acacia">
              Sign out
            </button>
          ) : (
            <>
              <Link href="/login" className="font-body text-sm text-ink/80 hover:text-acacia">
                Sign in
              </Link>
              <Link
                href="/register"
                className="rounded-full bg-sunset px-5 py-2.5 font-body text-sm font-semibold text-sand-light shadow-card transition hover:bg-sunset-soft hover:shadow-card-hover"
              >
                Get started
              </Link>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-expanded={menuOpen}
          aria-controls="mobile-nav"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-ink-horizon/15 text-ink-horizon md:hidden"
        >
          <svg width="18" height="14" viewBox="0 0 18 14" fill="none" aria-hidden="true">
            {menuOpen ? (
              <path d="M1 1L17 13M17 1L1 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            ) : (
              <path d="M0 1H18M0 7H18M0 13H18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            )}
          </svg>
        </button>
      </div>

      {menuOpen && (
        <nav id="mobile-nav" className="border-t border-ink-horizon/10 bg-sand-light px-6 py-4 md:hidden">
          <ul className="flex flex-col gap-4 font-body text-base text-ink/80">
            {navLinks.map((link) => (
              <li key={`${link.href}-${link.label}`}>
                <Link href={link.href} onClick={() => setMenuOpen(false)}>
                  {link.label}
                </Link>
              </li>
            ))}
            {loggedIn && (
              <li>
                <Link href="/dashboard" onClick={() => setMenuOpen(false)}>
                  Dashboard
                </Link>
              </li>
            )}
          </ul>
          <div className="mt-5 flex flex-col gap-3 border-t border-ink-horizon/10 pt-5">
            {loggedIn ? (
              <button onClick={handleSignOut} className="text-left font-body text-sm text-ink/80">
                Sign out
              </button>
            ) : (
              <>
                <Link href="/login" onClick={() => setMenuOpen(false)} className="font-body text-sm text-ink/80">
                  Sign in
                </Link>
                <Link
                  href="/register"
                  onClick={() => setMenuOpen(false)}
                  className="rounded-full bg-sunset px-5 py-2.5 text-center font-body text-sm font-semibold text-sand-light"
                >
                  Get started
                </Link>
              </>
            )}
          </div>
        </nav>
      )}
    </header>
  );
}
