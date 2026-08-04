import type { MetadataRoute } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "@/server/db";
import { listPublishedEntries } from "@/server/cms/entries";

const BASE = "https://www.mysilvers.in";

/**
 * The sitemap. There wasn't one — Google had no efficient way to discover 120
 * products beyond crawling links.
 *
 * Product entries carry `images`, which produces an image sitemap. That matters
 * disproportionately for jewellery: Google Images is a real discovery channel
 * for "oxidised silver ring" style queries, and without it the photography is
 * invisible to it.
 *
 * Cached and tagged alongside the catalogue, so publishing a product or a CMS
 * entry refreshes this too rather than leaving it a day stale.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  "use cache";
  cacheLife("hours");
  cacheTag("products", "categories", "cms:blog", "cms:page", "cms:collection");

  const [products, categories, posts, pages, collections] = await Promise.all([
    prisma.product.findMany({
      where: { isActive: true },
      select: { slug: true, updatedAt: true, images: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.category.findMany({
      where: { isActive: true },
      select: { slug: true, updatedAt: true },
    }),
    listPublishedEntries("blog", 200),
    listPublishedEntries("page", 200),
    listPublishedEntries("collection", 200),
  ]);

  // Hand-set: these are the entry points, and they change on their own cadence.
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: BASE, changeFrequency: "daily", priority: 1 },
    { url: `${BASE}/products`, changeFrequency: "daily", priority: 0.9 },
    { url: `${BASE}/collections`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${BASE}/blog`, changeFrequency: "weekly", priority: 0.6 },
  ];

  return [
    ...staticRoutes,

    ...products.map((p) => ({
      url: `${BASE}/products/${p.slug}`,
      lastModified: p.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.8,
      // Cloudinary URLs are absolute already, which is what image sitemaps need.
      images: p.images.length > 0 ? p.images : undefined,
    })),

    ...categories.map((c) => ({
      url: `${BASE}/category/${c.slug}`,
      lastModified: c.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),

    ...collections.map((c) => ({
      url: `${BASE}/collections/${c.slug}`,
      lastModified: c.publishedAt ?? undefined,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),

    ...posts.map((p) => ({
      url: `${BASE}/blog/${p.slug}`,
      lastModified: p.publishedAt ?? undefined,
      changeFrequency: "monthly" as const,
      priority: 0.5,
    })),

    ...pages.map((p) => ({
      url: `${BASE}/p/${p.slug}`,
      lastModified: p.publishedAt ?? undefined,
      changeFrequency: "yearly" as const,
      priority: 0.3,
    })),
  ];
}
