"use client";

import { updateSiteContent, type SiteAdminView, type SiteCta } from "@/lib/site-api";
import { HEX_RE, DEFAULT_BODY_FONT, DEFAULT_FOOTER_COLUMNS, DEFAULT_HEADING_FONT, DEFAULT_NAV_LINKS, THEME_COLORS, THEME_FONT_OPTIONS } from "@/lib/site-theme";
import { checkHref, prune, tidy, type Problems } from "@/lib/site-form";
import { Card, Field, GhostButton, ListEditor, SaveBar, TextInput, useDraft, useSaver, type EditorProps } from "./ui";

/** Colours & fonts, menu and footer. Each is optional: left alone, the site looks exactly as it always did. */

// ================================================================ Theme

type Fonts = "slab" | "sans" | "mono";

export function ThemeEditor({ data, token, onSaved, onDirty }: EditorProps) {
  const toDraft = (d: SiteAdminView) => {
    const e = d.stored.theme;
    return {
      colors: Object.fromEntries(THEME_COLORS.map((c) => [c.key, e?.colors?.[c.key] ?? ""])) as Record<string, string>,
      headingFont: (e?.headingFont ?? "") as Fonts | "",
      bodyFont: (e?.bodyFont ?? "") as Fonts | "",
    };
  };
  const { draft, setDraft, dirty, resetTo } = useDraft(toDraft(data), onDirty);
  const saver = useSaver();
  const commit = (body: Parameters<typeof updateSiteContent>[1], doneText?: string) =>
    saver.run(async () => {
      const view = await updateSiteContent(token, body);
      onSaved(view);
      resetTo(toDraft(view));
    }, doneText);

  const problems: Problems = [];
  for (const c of THEME_COLORS) {
    const v = draft.colors[c.key]?.trim();
    if (v && !HEX_RE.test(v)) problems.push(`${c.label} must be a 6-digit colour like ${c.fallback}`);
  }

  const payload = () => {
    const colors = Object.fromEntries(THEME_COLORS.map((c) => [c.key, draft.colors[c.key]?.trim() ?? ""]).filter(([, v]) => v));
    const theme = prune({
      colors,
      ...(draft.headingFont ? { headingFont: draft.headingFont } : {}),
      ...(draft.bodyFont ? { bodyFont: draft.bodyFont } : {}),
    });
    return { theme: (theme as SiteAdminView["stored"]["theme"]) ?? null };
  };

  const preview = (key: string, fallback: string) => (HEX_RE.test(draft.colors[key]?.trim() ?? "") ? draft.colors[key].trim() : fallback);

  return (
    <div className="space-y-5">
      <Card
        title="Colours"
        description="Pick the colours of your website. Leave a colour on its default to keep the original look; lighter and darker shades are worked out for you."
      >
        <div className="grid gap-5 sm:grid-cols-2">
          {THEME_COLORS.map((c) => {
            const value = draft.colors[c.key] ?? "";
            const set = (v: string) => setDraft({ ...draft, colors: { ...draft.colors, [c.key]: v } });
            return (
              <Field key={c.key} label={c.label} hint={`${c.hint} Default ${c.fallback}.`}>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    aria-label={`${c.label} colour picker`}
                    value={HEX_RE.test(value) ? value : c.fallback}
                    onChange={(e) => set(e.target.value.toUpperCase())}
                    className="h-9 w-12 cursor-pointer rounded border border-hairline bg-white p-0.5"
                  />
                  <input
                    type="text"
                    aria-label={`${c.label} hex value`}
                    value={value}
                    placeholder={c.fallback}
                    maxLength={7}
                    onChange={(e) => set(e.target.value.trim())}
                    className="w-28 rounded-lg border border-hairline bg-white px-3 py-2 font-mono text-sm text-ink placeholder:text-ink/35 focus:border-acacia"
                  />
                  {value && <GhostButton onClick={() => set("")}>Use default</GhostButton>}
                </div>
              </Field>
            );
          })}
        </div>
        <div
          aria-label="Colour preview"
          className="overflow-hidden rounded-xl border border-hairline"
          style={{ background: preview("sand", "#FBF4E7"), color: preview("ink", "#231F1C") }}
        >
          <div className="px-5 py-4" style={{ background: preview("inkHorizon", "#0B322D"), color: preview("sand", "#FBF4E7") }}>
            <strong>Your site name</strong>
            <span className="ml-3 text-xs" style={{ color: preview("gold", "#F2A93B") }}>
              TAGLINE
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3 px-5 py-4 text-sm">
            <span>Preview text.</span>
            <span style={{ color: preview("acacia", "#0E9B7C") }} className="font-semibold">
              A link
            </span>
            <span className="rounded-full px-4 py-1.5 font-semibold" style={{ background: preview("sunset", "#F2543D"), color: preview("sand", "#FBF4E7") }}>
              Get started
            </span>
            <span className="rounded-full px-3 py-1 text-xs font-semibold" style={{ background: preview("plum", "#7A3B63"), color: preview("sand", "#FBF4E7") }}>
              Badge
            </span>
          </div>
        </div>
      </Card>

      <Card title="Fonts" description="Choose the typeface for headings and for body text. Both are built into the site, so pages stay fast.">
        <div className="grid gap-5 sm:grid-cols-2">
          <FontSelect label="Headings" value={draft.headingFont} fallback={DEFAULT_HEADING_FONT} onChange={(v) => setDraft({ ...draft, headingFont: v })} />
          <FontSelect label="Body text" value={draft.bodyFont} fallback={DEFAULT_BODY_FONT} onChange={(v) => setDraft({ ...draft, bodyFont: v })} />
        </div>
      </Card>

      <SaveBar
        dirty={dirty}
        saving={saver.saving}
        problems={dirty ? problems : []}
        error={saver.error}
        notice={saver.notice}
        onSave={() => commit(payload())}
        onResetSections={() => {
          if (window.confirm("Put all colours and fonts back to the original look?")) commit({ theme: null }, "Reset to the original look");
        }}
      />
    </div>
  );
}

function FontSelect({ label, value, fallback, onChange }: { label: string; value: Fonts | ""; fallback: string; onChange: (v: Fonts | "") => void }) {
  return (
    <Field label={label}>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value as Fonts | "")}
        className="w-full rounded-lg border border-hairline bg-white px-3 py-2 text-sm text-ink focus:border-acacia"
      >
        <option value="">Default ({THEME_FONT_OPTIONS.find((o) => o.value === fallback)?.label.split(" - ")[0]})</option>
        {THEME_FONT_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

// ============================================================ Menu & footer

type FooterCol = { title: string; links: SiteCta[] };
const blankLink = (): SiteCta => ({ label: "", href: "" });
const blankColumn = (): FooterCol => ({ title: "", links: [blankLink()] });

function LinkRow({ value, onChange }: { value: SiteCta; onChange: (v: SiteCta) => void }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <TextInput label="Link text" value={value.label} onChange={(v) => onChange({ ...value, label: v })} maxLength={40} />
      <TextInput
        label="Goes to"
        value={value.href}
        onChange={(v) => onChange({ ...value, href: v })}
        maxLength={500}
        hint="A page on your site like /packages, or a full https:// link"
      />
    </div>
  );
}

function checkLinks(problems: Problems, where: string, links: SiteCta[]) {
  links.forEach((l, i) => {
    if (!l.label) problems.push(`${where} ${i + 1}: link text is required`);
    if (!l.href) problems.push(`${where} ${i + 1}: a link is required`);
    checkHref(problems, `${where} ${i + 1} link`, l.href);
  });
}

export function MenuFooterEditor({ data, token, onSaved, onDirty }: EditorProps) {
  const toDraft = (d: SiteAdminView) => ({
    customMenu: d.stored.navigation?.links !== undefined,
    menu: (d.stored.navigation?.links ?? DEFAULT_NAV_LINKS).map((l) => ({ ...l })),
    customFooter: d.stored.footer?.columns !== undefined,
    footer: (d.stored.footer?.columns ?? DEFAULT_FOOTER_COLUMNS).map((c) => ({ title: c.title, links: c.links.map((l) => ({ ...l })) })),
  });
  const { draft, setDraft, dirty, resetTo } = useDraft(toDraft(data), onDirty);
  const saver = useSaver();
  const commit = (body: Parameters<typeof updateSiteContent>[1], doneText?: string) =>
    saver.run(async () => {
      const view = await updateSiteContent(token, body);
      onSaved(view);
      resetTo(toDraft(view));
    }, doneText);

  const menu = tidy(draft.menu);
  const footer = tidy(draft.footer).filter((c) => c.title || c.links.length);
  const problems: Problems = [];
  if (draft.customMenu) checkLinks(problems, "Menu link", menu);
  if (draft.customFooter) {
    footer.forEach((c, i) => {
      if (!c.title) problems.push(`Footer column ${i + 1}: a heading is required`);
      checkLinks(problems, `Footer column ${i + 1}, link`, c.links);
    });
  }

  const payload = () => ({
    navigation: draft.customMenu ? { links: menu } : null,
    footer: draft.customFooter ? { columns: footer } : null,
  });

  return (
    <div className="space-y-5">
      <Card
        title="Top menu"
        description="The links across the top of your website. About and Contact are added automatically once you fill those pages in."
      >
        <label className="flex items-center gap-2 text-sm text-ink-horizon">
          <input type="checkbox" checked={draft.customMenu} onChange={(e) => setDraft({ ...draft, customMenu: e.target.checked })} />
          Use my own menu links (otherwise the standard Destinations / Packages / My trips menu is shown)
        </label>
        {draft.customMenu && (
          <ListEditor
            items={draft.menu}
            onChange={(next) => setDraft({ ...draft, menu: next })}
            makeEmpty={blankLink}
            max={8}
            addLabel="Add a menu link"
            itemLabel="Menu link"
            emptyText="No menu links - only the Sign in / Get started buttons will show."
            renderItem={(item, update) => <LinkRow value={item} onChange={update} />}
          />
        )}
      </Card>

      <Card title="Footer links" description="Up to 4 columns of links at the bottom of every page.">
        <label className="flex items-center gap-2 text-sm text-ink-horizon">
          <input type="checkbox" checked={draft.customFooter} onChange={(e) => setDraft({ ...draft, customFooter: e.target.checked })} />
          Use my own footer links (otherwise the standard Explore / Account / Company columns are shown)
        </label>
        {draft.customFooter && (
          <ListEditor
            items={draft.footer}
            onChange={(next) => setDraft({ ...draft, footer: next })}
            makeEmpty={blankColumn}
            max={4}
            addLabel="Add a column"
            itemLabel="Column"
            emptyText="No columns - the footer will only show your name and tagline."
            renderItem={(col, updateCol) => (
              <div className="space-y-4">
                <TextInput label="Column heading" value={col.title} onChange={(v) => updateCol({ ...col, title: v })} maxLength={40} />
                <ListEditor
                  items={col.links}
                  onChange={(links) => updateCol({ ...col, links })}
                  makeEmpty={blankLink}
                  max={8}
                  addLabel="Add a link"
                  itemLabel="Link"
                  renderItem={(l, upd) => <LinkRow value={l} onChange={upd} />}
                />
              </div>
            )}
          />
        )}
      </Card>

      <SaveBar
        dirty={dirty}
        saving={saver.saving}
        problems={dirty ? problems : []}
        error={saver.error}
        notice={saver.notice}
        onSave={() => commit(payload())}
        onResetSections={() => {
          if (window.confirm("Go back to the standard menu and footer links?")) commit({ navigation: null, footer: null }, "Reset to the standard links");
        }}
      />
    </div>
  );
}
