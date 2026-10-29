import Link from "next/link";
import { DEFAULT_FOOTER_COLUMNS, type FooterColumn } from "@/lib/site-theme";

const DEFAULT_COLUMNS: FooterColumn[] = DEFAULT_FOOTER_COLUMNS.map((c) => ({
  title: c.title,
  links: c.links.map((l) => ({ label: l.label, href: l.href })),
}));

interface FooterProps {
  /** From the tenant's saved site content (Admin -> Site content -> Brand & SEO). Tokens are already filled in. */
  siteName?: string;
  footerTagline?: string;
  copyright?: string;
  /** The tenant's own link columns (Admin -> Site content -> Menu & footer). Omitted = the built-in three. */
  columns?: FooterColumn[];
}

export function Footer({
  siteName = "NaviMus",
  footerTagline = "Multi-stop trips, booked properly.",
  copyright = `© ${new Date().getFullYear()} NaviMus Travel - demo build, not a real booking platform.`,
  columns = DEFAULT_COLUMNS,
}: FooterProps) {
  return (
    <footer className="mt-24 border-t border-ink-horizon/10 bg-ink-horizon py-14 text-sand/70">
      <div className={`mx-auto grid max-w-8xl grid-cols-2 gap-8 px-3 font-body text-sm ${columns.length > 3 ? "sm:grid-cols-5" : "sm:grid-cols-4"}`}>
        <div className="col-span-2 sm:col-span-1">
          <p className="font-display text-lg text-sand">{siteName}</p>
          {footerTagline && <p className="mt-2 max-w-[22ch] text-sand/50">{footerTagline}</p>}
        </div>
        {columns.map((col, i) => (
          <div key={`${col.title}-${i}`}>
            <p className="mb-3 font-body text-sm font-semibold text-sand">{col.title}</p>
            <ul className="space-y-2">
              {col.links.map((link, j) => (
                <li key={`${link.href}-${j}`}>
                  <Link href={link.href} className="hover:text-sand">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {copyright && <p className="mx-auto mt-10 max-w-8xl px-3 font-mono text-xs text-sand/30">{copyright}</p>}
    </footer>
  );
}
