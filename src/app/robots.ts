import type { MetadataRoute } from "next";

/**
 * robots.txt for Pulliq.
 * Allow all crawlers full access. The sitemap is referenced for discovery.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
      },
    ],
    sitemap: "https://pulliq.app/sitemap.xml",
    host: "https://pulliq.app",
  };
}
