import type { Metadata } from "next";
import { Zilla_Slab, Inter, IBM_Plex_Mono } from "next/font/google";
// @ts-ignore CSS imports are resolved by Next.js at build time.
import "./globals.css";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { SiteBrandProvider } from "@/components/site-brand";
import { getSiteContent } from "@/lib/site-content-server";
import { extraNavLinks, safeHref, safeImageUrl } from "@/lib/site-content";
import { buildThemeCss, resolveFooterColumns, resolveNavLinks } from "@/lib/site-theme";

const zilla = Zilla_Slab({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-zilla" });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plex-mono" });

/**
 * Page title/description now come from the tenant's saved site content (Admin -> Site content -> Brand & SEO)
 * instead of being hard-coded. getSiteContent() never throws: if the API is unreachable it returns the same
 * defaults this file used to hard-code, so the site still renders.
 */
export async function generateMetadata(): Promise<Metadata> {
  const site = await getSiteContent();
  const ogImage = safeImageUrl(site.seo.ogImageUrl);
  return {
    title: site.seo.title,
    description: site.seo.description,
    ...(ogImage ? { openGraph: { title: site.seo.title, description: site.seo.description, images: [ogImage] } } : {}),
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const site = await getSiteContent();
  // "" unless the tenant customised colours/fonts (Admin -> Site content -> Theme); only validated hex values
  // and a closed font list can reach this string (see lib/site-theme.ts).
  const themeCss = buildThemeCss(site.theme);
  return (
    <html lang="en" className={`${zilla.variable} ${inter.variable} ${plexMono.variable}`}>
      {/* <head>{themeCss && <style dangerouslySetInnerHTML={{ __html: themeCss }} />}</head> */}
      {themeCss ? <head><style dangerouslySetInnerHTML={{ __html: themeCss }} /></head> : null}
      <body>
        <Header
          siteName={site.brand.siteName}
          tagline={site.brand.tagline}
          logoUrl={safeImageUrl(site.brand.logoUrl)}
          links={resolveNavLinks(site.navigation?.links, safeHref)}
          extraLinks={extraNavLinks(site)}
        />
        <SiteBrandProvider siteName={site.brand.siteName}>
          <main>{children}</main>
        </SiteBrandProvider>
        <Footer
          siteName={site.brand.siteName}
          footerTagline={site.brand.footerTagline}
          copyright={site.brand.copyright}
          columns={resolveFooterColumns(site.footer?.columns, safeHref)}
        />
      </body>
    </html>
  );
}
