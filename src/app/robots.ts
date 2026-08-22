import type { MetadataRoute } from "next";

const BASE_URL = "https://www.sitefile.app";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/welcome", "/support", "/privacy", "/terms"],
      disallow: [
        "/account",
        "/projects/",
        "/capture",
        "/demo",
        "/r/",
        "/api/",
        "/trpc/",
        "/sign-in",
        "/sign-up",
      ],
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
    host: BASE_URL,
  };
}
