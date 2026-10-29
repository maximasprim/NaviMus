import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSiteContent } from "@/lib/site-content-server";
import { isAboutConfigured, isContactConfigured, safeImageUrl } from "@/lib/site-content";

/**
 * The tenant's story. This page exists only once the tenant has filled in About in the admin console -
 * until then it 404s and nothing links to it, so tenants who never configure it are unaffected.
 * All text is rendered as plain text (escaped by React), never as HTML.
 */
export async function generateMetadata(): Promise<Metadata> {
  const site = await getSiteContent();
  if (!isAboutConfigured(site)) return {};
  return {
    title: `${site.about?.headline || "About"} - ${site.brand.siteName}`,
    ...(site.about?.intro ? { description: site.about.intro } : {}),
  };
}

export default async function AboutPage() {
  const site = await getSiteContent();
  if (!isAboutConfigured(site)) notFound();
  const about = site.about!;
  const image = safeImageUrl(about.imageUrl);

  return (
    <article className="mx-auto max-w-6xl px-6 py-20">
      <header className="max-w-2xl">
        <h1 className="font-display text-4xl text-ink-horizon md:text-5xl">{about.headline || `About ${site.brand.siteName}`}</h1>
        {about.intro && <p className="mt-4 text-lg text-ink/60">{about.intro}</p>}
      </header>

      <div className={`mt-12 grid gap-12 ${image ? "md:grid-cols-2" : ""}`}>
        {about.paragraphs && about.paragraphs.length > 0 && (
          <div className="max-w-2xl space-y-5 leading-relaxed text-ink/80">
            {about.paragraphs.map((paragraph, i) => (
              <p key={i} className="whitespace-pre-line">
                {paragraph}
              </p>
            ))}
          </div>
        )}
        {image && (
          // eslint-disable-next-line @next/next/no-img-element -- tenant-supplied https URL; next/image would need every host allow-listed
          <img src={image} alt="" className="w-full rounded-3xl object-cover" loading="lazy" />
        )}
      </div>

      {about.highlights && about.highlights.length > 0 && (
        <ul className="mt-16 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {about.highlights.map((h, i) => (
            <li key={`${h.title}-${i}`} className="rounded-2xl border border-ink-horizon/10 bg-sand-light p-6">
              <h2 className="font-display text-lg text-ink-horizon">{h.title}</h2>
              <p className="mt-2 text-sm text-ink/60">{h.body}</p>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-16 flex flex-wrap gap-3">
        <Link
          href="/packages"
          className="rounded-full bg-gold px-6 py-3 font-body text-sm font-semibold text-ink-horizon transition hover:bg-gold-soft"
        >
          Browse packages
        </Link>
        {isContactConfigured(site) && (
          <Link
            href="/contact"
            className="rounded-full border border-ink-horizon/20 px-6 py-3 font-body text-sm font-medium text-ink-horizon transition hover:border-ink-horizon/40"
          >
            Get in touch
          </Link>
        )}
      </div>
    </article>
  );
}
