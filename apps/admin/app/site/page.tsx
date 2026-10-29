"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { getSiteAdmin, type SiteAdminView, type SiteIdentity } from "@/lib/site-api";
import { getToken, isLoggedIn } from "@/lib/session";
import { getSelectedTenant, setSelectedTenant } from "@/lib/tenant-session";
import {
  AboutEditor,
  BrandEditor,
  ContactEditor,
  CtaEditor,
  HomeEditor,
  IdentityEditor,
  TestimonialsEditor,
} from "@/components/site-editor/editors";
import { MenuFooterEditor, ThemeEditor } from "@/components/site-editor/appearance-editors";
import { PageShell, PageSkeleton, type EditorProps } from "@/components/site-editor/ui";

const TABS = [
  { id: "identity", label: "Address & name" },
  { id: "brand", label: "Brand & SEO" },
  { id: "home", label: "Home page" },
  { id: "theme", label: "Colours & fonts" },
  { id: "menu", label: "Menu & footer" },
  { id: "testimonials", label: "Testimonials" },
  { id: "cta", label: "Call to action" },
  { id: "about", label: "About" },
  { id: "contact", label: "Contact" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export default function SiteContentPage() {
  const [view, setView] = useState<SiteAdminView | null>(null);
  const [loggedIn, setLoggedIn] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<TabId>("identity");
  const [dirty, setDirty] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!isLoggedIn()) {
      setLoggedIn(false);
      return;
    }
    getSiteAdmin(getToken()!)
      .then(setView)
      .catch((err) => setError(err.message ?? "Could not load the site settings."));
  }, []);

  // Don't let a stray tab close or refresh throw away unsaved edits.
  const anyDirty = Object.values(dirty).some(Boolean);
  useEffect(() => {
    if (!anyDirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [anyDirty]);

  const onDirtyFor = useCallback((tab: TabId) => (isDirty: boolean) => setDirty((d) => (d[tab] === isDirty ? d : { ...d, [tab]: isDirty })), []);

  const savedFor = (tab: TabId) => (next: SiteAdminView) => {
    setView(next);
    setDirty((d) => ({ ...d, [tab]: false }));
  };

  /** After the address or name changes, keep the console pointed at the same tenant BY ID so it never loses it. */
  function identityChanged(identity: SiteIdentity) {
    setSelectedTenant({ id: identity.id, name: identity.name, slug: identity.slug });
  }

  if (!loggedIn) {
    return (
      <PageShell>
        <p className="text-fog">
          <Link href="/login" className="font-medium text-acacia underline underline-offset-2">
            Sign in
          </Link>{" "}
          to edit your site.
        </p>
      </PageShell>
    );
  }
  if (error) {
    return (
      <PageShell>
        <p role="alert" className="text-plum">
          {error}
        </p>
      </PageShell>
    );
  }
  if (!view) return <PageSkeleton />;

  const token = getToken()!;
  const selected = getSelectedTenant();
  const base = (tab: TabId): EditorProps => ({
    data: view,
    token,
    onSaved: savedFor(tab),
    onDirty: onDirtyFor(tab),
  });

  return (
    <PageShell>
      <h1 className="text-2xl font-semibold tracking-tight text-ink-horizon">Site content</h1>
      <p className="mt-1 max-w-2xl text-sm text-fog">
        Everything visitors see on your public website. Changes go live as soon as you save.{" "}
        Editing <strong className="text-ink-horizon">{view.identity.name}</strong>
        <span className="text-fog"> · address </span>
        <code className="rounded bg-white px-1.5 py-0.5 text-xs text-ink-horizon">{view.identity.slug}</code>
        {selected && selected.id !== view.identity.id ? " (the selected tenant differs - refresh)" : ""}
      </p>

      <div role="tablist" aria-label="Site content sections" className="mt-6 flex flex-wrap gap-1 border-b border-hairline">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={active === tab.id}
            aria-controls={`panel-${tab.id}`}
            type="button"
            onClick={() => setActive(tab.id)}
            className={`-mb-px flex items-center gap-1.5 rounded-t-lg border-b-2 px-4 py-2.5 text-sm transition-colors ${
              active === tab.id ? "border-ink-horizon font-medium text-ink-horizon" : "border-transparent text-fog hover:text-ink-horizon"
            }`}
          >
            {tab.label}
            {dirty[tab.id] && <span className="h-1.5 w-1.5 rounded-full bg-gold" title="Unsaved changes" aria-label="Unsaved changes" />}
          </button>
        ))}
      </div>

      {/* All tabs stay mounted (just hidden) so a half-finished edit survives switching tabs. */}
      <div className="mt-6">
        <Panel id="identity" active={active}>
          <IdentityEditor {...base("identity")} onIdentityChanged={identityChanged} />
        </Panel>
        <Panel id="brand" active={active}>
          <BrandEditor {...base("brand")} />
        </Panel>
        <Panel id="home" active={active}>
          <HomeEditor {...base("home")} />
        </Panel>
        <Panel id="theme" active={active}>
          <ThemeEditor {...base("theme")} />
        </Panel>
        <Panel id="menu" active={active}>
          <MenuFooterEditor {...base("menu")} />
        </Panel>
        <Panel id="testimonials" active={active}>
          <TestimonialsEditor {...base("testimonials")} />
        </Panel>
        <Panel id="cta" active={active}>
          <CtaEditor {...base("cta")} />
        </Panel>
        <Panel id="about" active={active}>
          <AboutEditor {...base("about")} />
        </Panel>
        <Panel id="contact" active={active}>
          <ContactEditor {...base("contact")} />
        </Panel>
      </div>
    </PageShell>
  );
}

function Panel({ id, active, children }: { id: TabId; active: TabId; children: React.ReactNode }) {
  return (
    <div role="tabpanel" id={`panel-${id}`} aria-labelledby={`tab-${id}`} hidden={active !== id} className="max-w-3xl">
      {children}
    </div>
  );
}
