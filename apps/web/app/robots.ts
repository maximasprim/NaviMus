import { getServerSiteUrl } from "@/lib/tenant-server";
import type { MetadataRoute } from "next";


export default function robots(): MetadataRoute.Robots {
  const SITE_URL = getServerSiteUrl(); // this tenant's own origin
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Checkout/account pages have no SEO value and shouldn't be indexed -
        // they also require auth, so a crawler would just hit empty states.
        disallow: ["/checkout/", "/bookings", "/login", "/register"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
