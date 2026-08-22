import type { MetadataRoute } from "next";

const BASE_URL = "https://www.sitefile.app";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${BASE_URL}/welcome`,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${BASE_URL}/support`,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${BASE_URL}/privacy`,
      changeFrequency: "yearly",
      priority: 0.2,
    },
    {
      url: `${BASE_URL}/terms`,
      changeFrequency: "yearly",
      priority: 0.2,
    },
  ];
}
