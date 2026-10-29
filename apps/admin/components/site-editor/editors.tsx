"use client";

import {
  getSiteAdmin,
  updateSiteContent,
  updateSiteIdentity,
  type SiteAdminView,
  type SiteCta,
  type SiteIdentity,
  type SiteStat,
  type SiteStep,
} from "@/lib/site-api";
import {
  SLUG_RE,
  checkHref,
  checkUrl,
  isEmail,
  isPhone,
  sectionFromDefaults,
  sectionWithoutDefaults,
  tidy,
  type Problems,
  type SectionPayload,
} from "@/lib/site-form";
import { HeroVideoUpload } from "./video-upload";
import {
  Card,
  ListEditor,
  SaveBar,
  TextArea,
  TextInput,
  defaultHint,
  useDraft,
  useSaver,
  type EditorProps,
} from "./ui";

/** Drops empty-string properties from list items (optional fields the admin left blank). */
function stripEmpty<T extends object>(item: T): T {
  return Object.fromEntries(Object.entries(item).filter(([, v]) => v !== "")) as T;
}

const blankStat = (): SiteStat => ({ value: "", label: "" });
const blankStep = (): SiteStep => ({ title: "", body: "" });

function CtaFields({ label, value, onChange }: { label: string; value: SiteCta; onChange: (v: SiteCta) => void }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <TextInput label={`${label} - button text`} value={value.label} onChange={(v) => onChange({ ...value, label: v })} maxLength={40} />
      <TextInput
        label={`${label} - link`}
        value={value.href}
        onChange={(v) => onChange({ ...value, href: v })}
        maxLength={500}
        hint="A page on your site like /packages, or a full https:// link"
      />
    </div>
  );
}

function StatRows({ items, onChange, max, empty }: { items: SiteStat[]; onChange: (v: SiteStat[]) => void; max: number; empty?: string }) {
  return (
    <ListEditor
      items={items}
      onChange={onChange}
      makeEmpty={blankStat}
      max={max}
      addLabel="Add a stat"
      itemLabel="Stat"
      emptyText={empty}
      renderItem={(item, update) => (
        <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
          <TextInput label="Number" value={item.value} onChange={(v) => update({ ...item, value: v })} maxLength={12} placeholder="40+" />
          <TextInput label="Label" value={item.label} onChange={(v) => update({ ...item, label: v })} maxLength={60} placeholder="Ready-made itineraries" />
        </div>
      )}
    />
  );
}

function checkStats(problems: Problems, label: string, items: SiteStat[]) {
  items.forEach((s, i) => {
    if (!s.value || !s.label) problems.push(`${label} ${i + 1}: needs both a number and a label`);
  });
}
function checkCta(problems: Problems, label: string, cta: SiteCta) {
  if (!cta.label) problems.push(`${label}: button text is required`);
  if (!cta.href) problems.push(`${label}: a link is required`);
  checkHref(problems, `${label} link`, cta.href);
}

// =============================================================== Identity

export function IdentityEditor({
  data,
  token,
  onSaved,
  onDirty,
  onIdentityChanged,
}: EditorProps & { onIdentityChanged: (identity: SiteIdentity) => void }) {
  const { identity } = data;
  const isDefaultTenant = identity.slug === "default";
  const { draft, setDraft, dirty, resetTo } = useDraft({ name: identity.name, slug: identity.slug, confirm: false }, onDirty);
  const saver = useSaver();

  const slugChanged = draft.slug.trim() !== identity.slug;
  const problems: Problems = [];
  if (draft.name.trim().length < 2) problems.push("Organisation name must be at least 2 characters");
  if (slugChanged) {
    const s = draft.slug.trim();
    if (s.length < 3 || s.length > 63) problems.push("The address must be 3-63 characters");
    else if (!SLUG_RE.test(s)) problems.push("The address can only use lowercase letters, numbers and single hyphens");
    if (!draft.confirm) problems.push("Tick the box to confirm you understand the address will move");
  }

  async function save() {
    await saver.run(async () => {
      const body: { name?: string; slug?: string; confirmSlugChange?: true } = {};
      if (draft.name.trim() !== identity.name) body.name = draft.name.trim();
      if (slugChanged) {
        body.slug = draft.slug.trim();
        body.confirmSlugChange = true;
      }
      const updated = await updateSiteIdentity(token, body);
      onIdentityChanged(updated);
      onSaved(await getSiteAdmin(token));
      resetTo({ name: updated.name, slug: updated.slug, confirm: false });
    }, slugChanged ? "Saved - your site now lives at the new address" : "Saved");
  }

  return (
    <div className="space-y-5">
      <Card title="Site address" description="This is your site's address on the platform and what the platform uses to find your site.">
        <TextInput
          label="Address (slug)"
          value={draft.slug}
          onChange={(v) => setDraft({ ...draft, slug: v.toLowerCase().replace(/\s+/g, "-"), confirm: false })}
          maxLength={63}
          disabled={isDefaultTenant}
          hint={
            isDefaultTenant
              ? "The seeded default tenant's address is fixed."
              : "Lowercase letters, numbers and hyphens, e.g. acme-safaris"
          }
        />
        {slugChanged && (
          <div className="rounded-xl border border-gold/40 bg-gold/10 p-4 text-sm text-ink-horizon">
            <p className="font-medium">Changing the address moves your site.</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-ink/80">
              <li>
                The old address <strong>{identity.slug}</strong> stops working immediately; links and bookmarks to it will break.
              </li>
              <li>If you sign in to this console using the address, use the new one from now on.</li>
              <li>Your content, packages and bookings are unaffected.</li>
            </ul>
            <label className="mt-3 flex items-start gap-2">
              <input
                type="checkbox"
                checked={draft.confirm}
                onChange={(e) => setDraft({ ...draft, confirm: e.target.checked })}
                className="mt-0.5"
              />
              <span>I understand - move my site to <strong>{draft.slug.trim() || "…"}</strong></span>
            </label>
          </div>
        )}
        {identity.customDomain && (
          <p className="text-sm text-fog">
            Custom domain: <strong className="text-ink-horizon">{identity.customDomain}</strong>{" "}
            {identity.customDomainVerifiedAt ? "(verified)" : "(not verified yet)"} - managed under Tenants.
          </p>
        )}
      </Card>

      <Card
        title="Organisation name"
        description="Used inside the admin console and in emails. The name visitors see on your website is set under Brand & SEO."
      >
        <TextInput label="Organisation name" value={draft.name} onChange={(v) => setDraft({ ...draft, name: v })} maxLength={200} />
      </Card>

      <SaveBar dirty={dirty} saving={saver.saving} problems={dirty ? problems : []} error={saver.error} notice={saver.notice} onSave={save} />
    </div>
  );
}

// ============================================================ Brand & SEO

export function BrandEditor({ data, token, onSaved, onDirty }: EditorProps) {
  const toDraft = (data: SiteAdminView) => {
    const e = data.effective;
    return {
      brand: {
        siteName: e.brand?.siteName ?? "",
        tagline: e.brand?.tagline ?? "",
        logoUrl: e.brand?.logoUrl ?? "",
        footerTagline: e.brand?.footerTagline ?? "",
        copyright: e.brand?.copyright ?? "",
      },
      seo: { title: e.seo?.title ?? "", description: e.seo?.description ?? "", ogImageUrl: e.seo?.ogImageUrl ?? "" },
    };
  };
  const d = data.defaults;
  const { draft, setDraft, dirty, resetTo } = useDraft(toDraft(data), onDirty);
  const saver = useSaver();
  /** Saves, then re-syncs this tab's draft to what the server now holds (no remount, so the confirmation stays visible). */
  const commit = (body: SectionPayload, doneText?: string) =>
    saver.run(async () => {
      const view = await updateSiteContent(token, body);
      onSaved(view);
      resetTo(toDraft(view));
    }, doneText);
  const b = draft.brand;
  const s = draft.seo;

  const problems: Problems = [];
  if (!b.siteName.trim()) problems.push("Site name is required");
  checkUrl(problems, "Logo", b.logoUrl);
  checkUrl(problems, "Share image", s.ogImageUrl);

  const payload = (): SectionPayload => ({
    brand: sectionFromDefaults(tidy(b), d.brand as typeof b),
    seo: sectionFromDefaults(tidy(s), d.seo as typeof s),
  });

  return (
    <div className="space-y-5">
      <Card title="Brand" description={<>Shown in the header, footer and browser tab. You can use <code>{"{siteName}"}</code> and <code>{"{year}"}</code> in any text on this page.</>}>
        <TextInput label="Site name" value={b.siteName} onChange={(v) => setDraft({ ...draft, brand: { ...b, siteName: v } })} maxLength={80} hint={defaultHint(d.brand?.siteName)} />
        <TextInput label="Tagline (header)" value={b.tagline} onChange={(v) => setDraft({ ...draft, brand: { ...b, tagline: v } })} maxLength={80} hint="The small line beside your name. Leave empty to hide it." />
        <TextInput
          label="Logo"
          type="url"
          value={b.logoUrl}
          onChange={(v) => setDraft({ ...draft, brand: { ...b, logoUrl: v } })}
          maxLength={500}
          placeholder="https://…/logo.png"
          hint="A full https:// link to your logo image. Leave empty to show your site name as text."
        />
        <TextInput label="Footer tagline" value={b.footerTagline} onChange={(v) => setDraft({ ...draft, brand: { ...b, footerTagline: v } })} maxLength={160} />
        <TextInput label="Copyright line" value={b.copyright} onChange={(v) => setDraft({ ...draft, brand: { ...b, copyright: v } })} maxLength={240} hint="Leave empty to hide it." />
      </Card>

      <Card title="Search & sharing" description="How your site appears in search results and when a link is shared.">
        <TextInput label="Page title" value={s.title} onChange={(v) => setDraft({ ...draft, seo: { ...s, title: v } })} maxLength={70} hint="Around 60 characters works best." />
        <TextArea label="Description" value={s.description} onChange={(v) => setDraft({ ...draft, seo: { ...s, description: v } })} maxLength={200} rows={2} />
        <TextInput label="Share image" type="url" value={s.ogImageUrl} onChange={(v) => setDraft({ ...draft, seo: { ...s, ogImageUrl: v } })} maxLength={500} placeholder="https://…/share.jpg" hint="Shown when your link is shared on social media." />
      </Card>

      <SaveBar
        dirty={dirty}
        saving={saver.saving}
        problems={dirty ? problems : []}
        error={saver.error}
        notice={saver.notice}
        onSave={() => commit(payload())}
        onResetSections={() => {
          if (window.confirm("Reset the brand and search settings to the platform defaults?")) commit({ brand: null, seo: null }, "Reset to defaults");
        }}
      />
    </div>
  );
}

// ============================================================== Home page

export function HomeEditor({ data, token, onSaved, onDirty }: EditorProps) {
  const toDraft = (data: SiteAdminView) => {
    const e = data.effective;
    return {
      hero: {
        headline: e.hero?.headline ?? "",
        subheadline: e.hero?.subheadline ?? "",
        primaryCta: { label: e.hero?.primaryCta?.label ?? "", href: e.hero?.primaryCta?.href ?? "" },
        secondaryCta: { label: e.hero?.secondaryCta?.label ?? "", href: e.hero?.secondaryCta?.href ?? "" },
        stats: e.hero?.stats ?? [],
        routeStops: e.hero?.routeStops ?? [],
        videoUrls: e.hero?.videoUrls ?? [],
      },
      stats: { items: e.stats?.items ?? [] },
      sections: {
        destinationsHeading: e.sections?.destinationsHeading ?? "",
        destinationsIntro: e.sections?.destinationsIntro ?? "",
        packagesHeading: e.sections?.packagesHeading ?? "",
        packagesIntro: e.sections?.packagesIntro ?? "",
      },
      howItWorks: { heading: e.howItWorks?.heading ?? "", intro: e.howItWorks?.intro ?? "", steps: e.howItWorks?.steps ?? [] },
    };
  };
  const d = data.defaults;
  const { draft, setDraft, dirty, resetTo } = useDraft(toDraft(data), onDirty);
  const saver = useSaver();
  /** Saves, then re-syncs this tab's draft to what the server now holds (no remount, so the confirmation stays visible). */
  const commit = (body: SectionPayload, doneText?: string) =>
    saver.run(async () => {
      const view = await updateSiteContent(token, body);
      onSaved(view);
      resetTo(toDraft(view));
    }, doneText);
  const { hero, stats, sections, howItWorks } = draft;

  const t = tidy(draft);
  const problems: Problems = [];
  if (!t.hero.headline) problems.push("Hero headline is required");
  checkCta(problems, "Hero main button", t.hero.primaryCta);
  checkCta(problems, "Hero second button", t.hero.secondaryCta);
  checkStats(problems, "Hero stat", t.hero.stats);
  if (t.hero.routeStops.length === 1) problems.push("The route map needs at least 2 stops (or remove them all to hide the map)");
  t.hero.videoUrls.forEach((u, i) => checkUrl(problems, `Background video ${i + 1}`, u));
  checkStats(problems, "Stats bar item", t.stats.items);
  if (!t.sections.destinationsHeading) problems.push("Destinations heading is required");
  if (!t.sections.packagesHeading) problems.push("Packages heading is required");
  if (!t.howItWorks.heading) problems.push("How-it-works heading is required");
  t.howItWorks.steps.forEach((s, i) => {
    if (!s.title || !s.body) problems.push(`Step ${i + 1}: needs a title and a description`);
  });

  const payload = (): SectionPayload => ({
    hero: sectionFromDefaults(t.hero, d.hero as typeof t.hero),
    stats: sectionFromDefaults(t.stats, d.stats as typeof t.stats),
    sections: sectionFromDefaults(t.sections, d.sections as typeof t.sections),
    howItWorks: sectionFromDefaults(t.howItWorks, d.howItWorks as typeof t.howItWorks),
  });

  return (
    <div className="space-y-5">
      <Card title="Hero" description="The big banner at the top of your home page.">
        <TextArea label="Headline" value={hero.headline} onChange={(v) => setDraft({ ...draft, hero: { ...hero, headline: v } })} maxLength={120} rows={2} hint="Press Enter to start a new line." />
        <TextArea label="Supporting text" value={hero.subheadline} onChange={(v) => setDraft({ ...draft, hero: { ...hero, subheadline: v } })} maxLength={300} rows={2} />
        <CtaFields label="Main button" value={hero.primaryCta} onChange={(v) => setDraft({ ...draft, hero: { ...hero, primaryCta: v } })} />
        <CtaFields label="Second button" value={hero.secondaryCta} onChange={(v) => setDraft({ ...draft, hero: { ...hero, secondaryCta: v } })} />
        <div>
          <p className="mb-2 text-sm font-medium text-ink-horizon">Small figures under the buttons</p>
          <StatRows items={hero.stats} onChange={(v) => setDraft({ ...draft, hero: { ...hero, stats: v } })} max={4} empty="No figures - this row is hidden." />
        </div>
      </Card>

      <Card title="Route map" description="The drawn route beside the headline. List the stops in order (2 to 6), or remove them all to hide the map.">
        <ListEditor
          items={hero.routeStops}
          onChange={(v) => setDraft({ ...draft, hero: { ...hero, routeStops: v } })}
          makeEmpty={() => ""}
          max={6}
          addLabel="Add a stop"
          itemLabel="Stop"
          emptyText="No stops - the map is hidden."
          renderItem={(item, update) => <TextInput label="Place name" value={item} onChange={update} maxLength={30} />}
        />
      </Card>

      <Card title="Background video" description="Optional. Upload short clips (or paste a full https:// link to an MP4) to replace the built-in footage. Leave empty to keep the default clips.">
        <ListEditor
          items={hero.videoUrls}
          onChange={(v) => setDraft({ ...draft, hero: { ...hero, videoUrls: v } })}
          makeEmpty={() => ""}
          max={7}
          addLabel="Add a clip"
          itemLabel="Clip"
          emptyText="Using the built-in clips."
          renderItem={(item, update) => (
            <div className="space-y-2">
              <TextInput label="Video link" type="url" value={item} onChange={update} maxLength={500} placeholder="https://…/clip.mp4" />
              {item.startsWith("https://") && <video src={item} muted playsInline controls preload="metadata" className="h-28 rounded-lg bg-ink-horizon/10" />}
            </div>
          )}
        />
        <HeroVideoUpload
          token={token}
          remaining={7 - hero.videoUrls.length}
          // Updater form: an upload can finish after other edits, which must not be overwritten by a stale `draft`.
          onUploaded={(urls) => setDraft((d) => ({ ...d, hero: { ...d.hero, videoUrls: [...d.hero.videoUrls, ...urls].slice(0, 7) } }))}
        />
      </Card>

      <Card title="Stats bar" description="The row of figures below the hero. Remove them all to hide it.">
        <StatRows items={stats.items} onChange={(v) => setDraft({ ...draft, stats: { items: v } })} max={6} empty="No stats - the bar is hidden." />
      </Card>

      <Card title="Section headings" description="The headings above the destinations and packages on your home page.">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput label="Destinations heading" value={sections.destinationsHeading} onChange={(v) => setDraft({ ...draft, sections: { ...sections, destinationsHeading: v } })} maxLength={100} />
          <TextInput label="Destinations intro" value={sections.destinationsIntro} onChange={(v) => setDraft({ ...draft, sections: { ...sections, destinationsIntro: v } })} maxLength={200} />
          <TextInput label="Packages heading" value={sections.packagesHeading} onChange={(v) => setDraft({ ...draft, sections: { ...sections, packagesHeading: v } })} maxLength={100} />
          <TextInput label="Packages intro" value={sections.packagesIntro} onChange={(v) => setDraft({ ...draft, sections: { ...sections, packagesIntro: v } })} maxLength={200} />
        </div>
      </Card>

      <Card title="How it works" description="The numbered steps. Remove them all to hide this section.">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput label="Heading" value={howItWorks.heading} onChange={(v) => setDraft({ ...draft, howItWorks: { ...howItWorks, heading: v } })} maxLength={100} />
          <TextInput label="Intro" value={howItWorks.intro} onChange={(v) => setDraft({ ...draft, howItWorks: { ...howItWorks, intro: v } })} maxLength={240} />
        </div>
        <ListEditor
          items={howItWorks.steps}
          onChange={(v) => setDraft({ ...draft, howItWorks: { ...howItWorks, steps: v } })}
          makeEmpty={blankStep}
          max={6}
          addLabel="Add a step"
          itemLabel="Step"
          emptyText="No steps - this section is hidden."
          renderItem={(item, update) => (
            <div className="space-y-4">
              <TextInput label="Title" value={item.title} onChange={(v) => update({ ...item, title: v })} maxLength={60} />
              <TextArea label="Description" value={item.body} onChange={(v) => update({ ...item, body: v })} maxLength={300} rows={2} />
            </div>
          )}
        />
      </Card>

      <SaveBar
        dirty={dirty}
        saving={saver.saving}
        problems={dirty ? problems : []}
        error={saver.error}
        notice={saver.notice}
        onSave={() => commit(payload())}
        onResetSections={() => {
          if (window.confirm("Reset the whole home page content to the platform defaults?"))
            commit({ hero: null, stats: null, sections: null, howItWorks: null }, "Reset to defaults");
        }}
      />
    </div>
  );
}

// ========================================================== Testimonials

export function TestimonialsEditor({ data, token, onSaved, onDirty }: EditorProps) {
  const toDraft = (data: SiteAdminView) => {
    const e = data.effective.testimonials;
    return {
      heading: e?.heading ?? "",
      items: (e?.items ?? []).map((t) => ({ quote: t.quote, name: t.name, trip: t.trip ?? "", photoUrl: t.photoUrl ?? "" })),
    };
  };
  const { draft, setDraft, dirty, resetTo } = useDraft(toDraft(data), onDirty);
  const saver = useSaver();
  /** Saves, then re-syncs this tab's draft to what the server now holds (no remount, so the confirmation stays visible). */
  const commit = (body: SectionPayload, doneText?: string) =>
    saver.run(async () => {
      const view = await updateSiteContent(token, body);
      onSaved(view);
      resetTo(toDraft(view));
    }, doneText);

  const t = tidy(draft);
  const problems: Problems = [];
  if (!t.heading) problems.push("Heading is required");
  t.items.forEach((it, i) => {
    if (!it.quote || !it.name) problems.push(`Testimonial ${i + 1}: needs a quote and a name`);
    checkUrl(problems, `Testimonial ${i + 1} photo`, it.photoUrl);
  });

  const payload = (): SectionPayload => ({
    testimonials: sectionFromDefaults({ heading: t.heading, items: t.items.map(stripEmpty) }, data.defaults.testimonials as { heading: string; items: typeof t.items }),
  });

  return (
    <div className="space-y-5">
      <Card title="Testimonials" description="Quotes from your travellers, shown on your home page. Remove them all to hide the section.">
        <TextInput label="Heading" value={draft.heading} onChange={(v) => setDraft({ ...draft, heading: v })} maxLength={100} />
        <ListEditor
          items={draft.items}
          onChange={(v) => setDraft({ ...draft, items: v })}
          makeEmpty={() => ({ quote: "", name: "", trip: "", photoUrl: "" })}
          max={12}
          addLabel="Add a testimonial"
          itemLabel="Testimonial"
          emptyText="No testimonials - this section is hidden."
          renderItem={(item, update) => (
            <div className="space-y-4">
              <TextArea label="Quote" value={item.quote} onChange={(v) => update({ ...item, quote: v })} maxLength={500} rows={3} />
              <div className="grid gap-4 sm:grid-cols-2">
                <TextInput label="Name" value={item.name} onChange={(v) => update({ ...item, name: v })} maxLength={80} placeholder="Amara O." />
                <TextInput label="Trip (optional)" value={item.trip} onChange={(v) => update({ ...item, trip: v })} maxLength={100} placeholder="9-day Kenya loop" />
              </div>
              <TextInput label="Photo (optional)" type="url" value={item.photoUrl} onChange={(v) => update({ ...item, photoUrl: v })} maxLength={500} placeholder="https://…/photo.jpg" />
            </div>
          )}
        />
      </Card>
      <SaveBar
        dirty={dirty}
        saving={saver.saving}
        problems={dirty ? problems : []}
        error={saver.error}
        notice={saver.notice}
        onSave={() => commit(payload())}
        onResetSections={() => {
          if (window.confirm("Reset the testimonials to the platform defaults?")) commit({ testimonials: null }, "Reset to defaults");
        }}
      />
    </div>
  );
}

// ======================================================== Call to action

export function CtaEditor({ data, token, onSaved, onDirty }: EditorProps) {
  const toDraft = (data: SiteAdminView) => {
    const e = data.effective.cta;
    return {
      heading: e?.heading ?? "",
      body: e?.body ?? "",
      primary: { label: e?.primary?.label ?? "", href: e?.primary?.href ?? "" },
      secondary: { label: e?.secondary?.label ?? "", href: e?.secondary?.href ?? "" },
    };
  };
  const { draft, setDraft, dirty, resetTo } = useDraft(toDraft(data), onDirty);
  const saver = useSaver();
  /** Saves, then re-syncs this tab's draft to what the server now holds (no remount, so the confirmation stays visible). */
  const commit = (body: SectionPayload, doneText?: string) =>
    saver.run(async () => {
      const view = await updateSiteContent(token, body);
      onSaved(view);
      resetTo(toDraft(view));
    }, doneText);
  const t = tidy(draft);
  const problems: Problems = [];
  if (!t.heading) problems.push("Heading is required");
  checkCta(problems, "Main button", t.primary);
  checkCta(problems, "Second button", t.secondary);

  return (
    <div className="space-y-5">
      <Card title="Call to action" description="The banner near the bottom of your home page.">
        <TextInput label="Heading" value={draft.heading} onChange={(v) => setDraft({ ...draft, heading: v })} maxLength={100} />
        <TextArea label="Text" value={draft.body} onChange={(v) => setDraft({ ...draft, body: v })} maxLength={240} rows={2} hint={<>You can use <code>{"{siteName}"}</code>.</>} />
        <CtaFields label="Main button" value={draft.primary} onChange={(v) => setDraft({ ...draft, primary: v })} />
        <CtaFields label="Second button" value={draft.secondary} onChange={(v) => setDraft({ ...draft, secondary: v })} />
      </Card>
      <SaveBar
        dirty={dirty}
        saving={saver.saving}
        problems={dirty ? problems : []}
        error={saver.error}
        notice={saver.notice}
        onSave={() => commit({ cta: sectionFromDefaults(t, data.defaults.cta as typeof t) })}
        onResetSections={() => {
          if (window.confirm("Reset the call to action to the platform defaults?")) commit({ cta: null }, "Reset to defaults");
        }}
      />
    </div>
  );
}

// ================================================================= About

export function AboutEditor({ data, token, onSaved, onDirty }: EditorProps) {
  const toDraft = (data: SiteAdminView) => {
    const e = data.effective.about;
    return {
      headline: e?.headline ?? "",
      intro: e?.intro ?? "",
      paragraphs: e?.paragraphs ?? [],
      imageUrl: e?.imageUrl ?? "",
      highlights: e?.highlights ?? [],
    };
  };
  const { draft, setDraft, dirty, resetTo } = useDraft(toDraft(data), onDirty);
  const saver = useSaver();
  /** Saves, then re-syncs this tab's draft to what the server now holds (no remount, so the confirmation stays visible). */
  const commit = (body: SectionPayload, doneText?: string) =>
    saver.run(async () => {
      const view = await updateSiteContent(token, body);
      onSaved(view);
      resetTo(toDraft(view));
    }, doneText);
  const t = tidy(draft);
  const problems: Problems = [];
  checkUrl(problems, "Image", t.imageUrl);
  t.highlights.forEach((h, i) => {
    if (!h.title || !h.body) problems.push(`Highlight ${i + 1}: needs a title and a description`);
  });

  return (
    <div className="space-y-5">
      <Card
        title="About page"
        description="Tell your story. The About page (and its menu link) appears on your site only once you add something here - clear everything and save to hide it again."
      >
        <TextInput label="Headline" value={draft.headline} onChange={(v) => setDraft({ ...draft, headline: v })} maxLength={120} placeholder="Our story" />
        <TextArea label="Introduction" value={draft.intro} onChange={(v) => setDraft({ ...draft, intro: v })} maxLength={400} rows={2} />
        <TextInput label="Photo" type="url" value={draft.imageUrl} onChange={(v) => setDraft({ ...draft, imageUrl: v })} maxLength={500} placeholder="https://…/team.jpg" hint="A full https:// link. Optional." />
        <div>
          <p className="mb-2 text-sm font-medium text-ink-horizon">Your story</p>
          <ListEditor
            items={draft.paragraphs}
            onChange={(v) => setDraft({ ...draft, paragraphs: v })}
            makeEmpty={() => ""}
            max={12}
            addLabel="Add a paragraph"
            itemLabel="Paragraph"
            emptyText="No story text yet."
            renderItem={(item, update) => <TextArea label="Text" value={item} onChange={update} maxLength={2000} rows={4} />}
          />
        </div>
      </Card>
      <Card title="Highlights" description="Short points shown as cards (what makes you different).">
        <ListEditor
          items={draft.highlights}
          onChange={(v) => setDraft({ ...draft, highlights: v })}
          makeEmpty={blankStep}
          max={6}
          addLabel="Add a highlight"
          itemLabel="Highlight"
          emptyText="No highlights."
          renderItem={(item, update) => (
            <div className="space-y-4">
              <TextInput label="Title" value={item.title} onChange={(v) => update({ ...item, title: v })} maxLength={60} />
              <TextArea label="Description" value={item.body} onChange={(v) => update({ ...item, body: v })} maxLength={300} rows={2} />
            </div>
          )}
        />
      </Card>
      <SaveBar
        dirty={dirty}
        saving={saver.saving}
        problems={dirty ? problems : []}
        error={saver.error}
        notice={saver.notice}
        saveLabel="Save About page"
        onSave={() => commit({ about: sectionWithoutDefaults(t) })}
        onResetSections={() => {
          if (window.confirm("Remove the About page from your site?")) commit({ about: null }, "About page removed");
        }}
      />
    </div>
  );
}

// =============================================================== Contact

export function ContactEditor({ data, token, onSaved, onDirty }: EditorProps) {
  const toDraft = (data: SiteAdminView) => {
    const e = data.effective.contact;
    return {
      email: e?.email ?? "",
      phone: e?.phone ?? "",
      whatsapp: e?.whatsapp ?? "",
      address: e?.address ?? "",
      hours: e?.hours ?? "",
      mapUrl: e?.mapUrl ?? "",
      social: {
        facebook: e?.social?.facebook ?? "",
        instagram: e?.social?.instagram ?? "",
        x: e?.social?.x ?? "",
        youtube: e?.social?.youtube ?? "",
        tiktok: e?.social?.tiktok ?? "",
        linkedin: e?.social?.linkedin ?? "",
      },
    };
  };
  const { draft, setDraft, dirty, resetTo } = useDraft(toDraft(data), onDirty);
  const saver = useSaver();
  /** Saves, then re-syncs this tab's draft to what the server now holds (no remount, so the confirmation stays visible). */
  const commit = (body: SectionPayload, doneText?: string) =>
    saver.run(async () => {
      const view = await updateSiteContent(token, body);
      onSaved(view);
      resetTo(toDraft(view));
    }, doneText);
  const t = tidy(draft);
  const problems: Problems = [];
  if (t.email && !isEmail(t.email)) problems.push("Email address doesn't look valid");
  if (t.phone && !isPhone(t.phone)) problems.push("Phone number doesn't look valid (digits, spaces, + ( ) - only)");
  if (t.whatsapp && !isPhone(t.whatsapp)) problems.push("WhatsApp number doesn't look valid");
  checkUrl(problems, "Map link", t.mapUrl);
  (Object.keys(t.social) as Array<keyof typeof t.social>).forEach((k) => checkUrl(problems, `${k[0]!.toUpperCase()}${k.slice(1)} link`, t.social[k]));

  const social = draft.social;
  const setSocial = (key: keyof typeof social, v: string) => setDraft({ ...draft, social: { ...social, [key]: v } });

  return (
    <div className="space-y-5">
      <Card
        title="Contact details"
        description="The Contact page (and its menu link) appears on your site only once you add something here, and your email and phone also appear in the footer. Clear everything and save to hide it again."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput label="Email" type="email" value={draft.email} onChange={(v) => setDraft({ ...draft, email: v })} maxLength={254} placeholder="hello@yourcompany.com" />
          <TextInput label="Phone" type="tel" value={draft.phone} onChange={(v) => setDraft({ ...draft, phone: v })} maxLength={20} placeholder="+254 700 000 000" />
          <TextInput label="WhatsApp" type="tel" value={draft.whatsapp} onChange={(v) => setDraft({ ...draft, whatsapp: v })} maxLength={20} placeholder="+254 700 000 000" hint="Include the country code. Adds a chat link." />
          <TextInput label="Map link" type="url" value={draft.mapUrl} onChange={(v) => setDraft({ ...draft, mapUrl: v })} maxLength={500} placeholder="https://maps.google.com/…" />
        </div>
        <TextArea label="Address" value={draft.address} onChange={(v) => setDraft({ ...draft, address: v })} maxLength={300} rows={3} />
        <TextArea label="Opening hours" value={draft.hours} onChange={(v) => setDraft({ ...draft, hours: v })} maxLength={300} rows={2} placeholder="Mon-Fri 8:00-17:00" />
      </Card>
      <Card title="Social media" description="Full https:// links to your profiles. They appear in your footer and on the Contact page.">
        <div className="grid gap-4 sm:grid-cols-2">
          {(["facebook", "instagram", "x", "youtube", "tiktok", "linkedin"] as const).map((k) => (
            <TextInput key={k} label={k === "x" ? "X (Twitter)" : `${k[0]!.toUpperCase()}${k.slice(1)}`} type="url" value={social[k]} onChange={(v) => setSocial(k, v)} maxLength={500} placeholder="https://…" />
          ))}
        </div>
      </Card>
      <SaveBar
        dirty={dirty}
        saving={saver.saving}
        problems={dirty ? problems : []}
        error={saver.error}
        notice={saver.notice}
        saveLabel="Save contact details"
        onSave={() => commit({ contact: sectionWithoutDefaults(t) })}
        onResetSections={() => {
          if (window.confirm("Remove the Contact page and your contact details from your site?")) commit({ contact: null }, "Contact details removed");
        }}
      />
    </div>
  );
}

