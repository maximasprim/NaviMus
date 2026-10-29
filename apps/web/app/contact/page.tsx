import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSiteContent } from "@/lib/site-content-server";
import { dialable, isContactConfigured, safeImageUrl } from "@/lib/site-content";

/**
 * How to reach the tenant. Exists only once the tenant has filled in Contact in the admin console -
 * until then it 404s and nothing links to it. All text is rendered as plain text, never as HTML, and
 * every link is built here from validated fields (mailto:, tel:, wa.me, or an https:// URL).
 */
export async function generateMetadata(): Promise<Metadata> {
  const site = await getSiteContent();
  if (!isContactConfigured(site)) return {};
  return { title: `Contact - ${site.brand.siteName}` };
}

const SOCIAL: Array<[string, string]> = [
  ["facebook", "Facebook"],
  ["instagram", "Instagram"],
  ["x", "X"],
  ["youtube", "YouTube"],
  ["tiktok", "TikTok"],
  ["linkedin", "LinkedIn"],
];

export default async function ContactPage() {
  const site = await getSiteContent();
  if (!isContactConfigured(site)) notFound();
  const c = site.contact!;
  const mapUrl = safeImageUrl(c.mapUrl);
  const social = SOCIAL.map(([key, label]) => ({
    label,
    href: safeImageUrl((c.social as Record<string, string | undefined> | undefined)?.[key]),
  })).filter((s) => s.href);
  const whatsappDigits = c.whatsapp ? dialable(c.whatsapp).replace(/^\+/, "") : "";

  const rows: Array<{ label: string; value: React.ReactNode }> = [];
  if (c.email) rows.push({ label: "Email", value: <a href={`mailto:${c.email}`} className="text-acacia hover:text-acacia-soft">{c.email}</a> });
  if (c.phone) rows.push({ label: "Phone", value: <a href={`tel:${dialable(c.phone)}`} className="text-acacia hover:text-acacia-soft">{c.phone}</a> });
  if (whatsappDigits)
    rows.push({
      label: "WhatsApp",
      value: (
        <a href={`https://wa.me/${whatsappDigits}`} target="_blank" rel="noopener noreferrer" className="text-acacia hover:text-acacia-soft">
          {c.whatsapp}
        </a>
      ),
    });
  if (c.address) rows.push({ label: "Address", value: <span className="whitespace-pre-line">{c.address}</span> });
  if (c.hours) rows.push({ label: "Opening hours", value: <span className="whitespace-pre-line">{c.hours}</span> });

  return (
    <section className="mx-auto max-w-6xl px-6 py-20">
      <h1 className="font-display text-4xl text-ink-horizon md:text-5xl">Contact {site.brand.siteName}</h1>

      <dl className="mt-12 grid max-w-2xl gap-6">
        {rows.map((row) => (
          <div key={row.label} className="grid gap-1 border-b border-ink-horizon/10 pb-6 sm:grid-cols-[10rem_1fr] sm:gap-6">
            <dt className="font-mono text-xs uppercase tracking-[0.15em] text-ink/50">{row.label}</dt>
            <dd className="text-ink/80">{row.value}</dd>
          </div>
        ))}
      </dl>

      {mapUrl && (
        <p className="mt-8">
          <a href={mapUrl} target="_blank" rel="noopener noreferrer" className="font-body text-sm font-semibold text-acacia hover:text-acacia-soft">
            View on map
          </a>
        </p>
      )}

      {social.length > 0 && (
        <ul className="mt-10 flex flex-wrap gap-x-6 gap-y-2 font-body text-sm">
          {social.map((s) => (
            <li key={s.label}>
              <a href={s.href} target="_blank" rel="noopener noreferrer" className="text-acacia hover:text-acacia-soft">
                {s.label}
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
