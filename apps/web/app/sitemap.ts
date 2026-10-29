import type { MetadataRoute } from "next";
import { listAllDestinationSlugs, listAllPackageSlugs } from "@/lib/api";
import { getServerSiteUrl, getServerTenantSlug } from "@/lib/tenant-server";


/**
 * Next.js's built-in sitemap convention - requesting /sitemap.xml
 * regenerates this at request time (or build time for static export).
 * Failures fetching the catalog degrade to the static pages only rather
 * than 500ing the whole sitemap, since a partial sitemap is far better
 * for SEO than none at all.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const SITE_URL = getServerSiteUrl(); // this tenant's own origin
  const staticEntries: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/destinations`, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/packages`, changeFrequency: "daily", priority: 0.9 },
  ];

  let destinationEntries: MetadataRoute.Sitemap = [];
  let packageEntries: MetadataRoute.Sitemap = [];

  try {
    const tenantSlug = await getServerTenantSlug();
    const [destinationSlugs, packageSlugs] = await Promise.all([
      listAllDestinationSlugs(tenantSlug),
      listAllPackageSlugs(tenantSlug),
    ]);
    destinationEntries = destinationSlugs.map((slug) => ({
      url: `${SITE_URL}/destinations/${slug}`,
      changeFrequency: "weekly",
      priority: 0.7,
    }));
    packageEntries = packageSlugs.map((slug) => ({
      url: `${SITE_URL}/packages/${slug}`,
      changeFrequency: "weekly",
      priority: 0.8,
    }));
  } catch {
    // API unreachable at build/request time - ship the static pages
    // rather than failing the whole sitemap request.
  }

  return [...staticEntries, ...destinationEntries, ...packageEntries];
}
