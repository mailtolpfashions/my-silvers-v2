import type { MetadataRoute } from "next";

const BASE = "https://www.mysilvers.in";

/**
 * robots.txt. There wasn't one, so crawlers had no steer at all — including no
 * pointer to the sitemap, and no instruction to stay out of the private areas.
 *
 * The disallows are belt-and-braces: /admin, /cms and /account are already
 * auth-gated in proxy.ts, and checkout/cart are per-shopper. Keeping them out
 * of the crawl budget matters more than the (nonexistent) secrecy — a crawler
 * spending requests on login redirects is a crawler not indexing products.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/admin",
          "/cms",
          "/account",
          "/checkout",
          "/cart",
          "/orders",
          "/preview",
          "/api/",
          // Faceted URLs multiply into near-duplicate pages; the canonical
          // listing and the category pages already cover this ground.
          "/products?*",
        ],
      },
    ],
    sitemap: `${BASE}/sitemap.xml`,
    host: BASE,
  };
}
