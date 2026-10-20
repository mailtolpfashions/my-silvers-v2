import type { MetadataRoute } from "next";

const BASE = "https://www.mysilvers.in";

/**
 * What every crawler may and may not fetch.
 *
 * The disallows are belt-and-braces: /admin, /cms and /account are already
 * auth-gated in proxy.ts, and checkout/cart are per-shopper. Keeping them out
 * of the crawl budget matters more than the (nonexistent) secrecy — a crawler
 * spending requests on login redirects is a crawler not indexing products.
 */
const DISALLOW = [
  "/admin",
  "/cms",
  "/account",
  "/checkout",
  "/cart",
  "/orders",
  "/preview",
  "/api/",
  // Faceted URLs multiply into near-duplicate pages; the canonical listing and
  // the category pages already cover this ground.
  "/products?*",
];

/**
 * ⚠️  `/products?q=*` is an exception carved out of the `/products?*` disallow
 * above, and it exists for exactly one reason: `SiteJsonLd` in
 * `components/storefront/structured-data.tsx` declares the sitelinks
 * SearchAction target as `/products?q={search_term_string}`. Google will not
 * show a search box whose target it has been told not to crawl, so without this
 * line the markup was advertising a URL this file forbade — the box was simply
 * dropped, silently.
 *
 * The precedence is not luck. Google resolves a conflicting allow/disallow by
 * longest matching pattern: "/products?q=*" is 13 characters against
 * "/products?*"'s 11, so it wins for search URLs and only for search URLs. The
 * faceted `category`/`sort`/`minPrice` combinations stay blocked.
 *
 * Change the SearchAction target and this line has to move with it.
 */
const ALLOW = ["/", "/products?q=*"];

/**
 * The crawlers behind AI answers — ChatGPT, Claude, Perplexity, Gemini, and the
 * Common Crawl corpus that seeds many others.
 *
 * Named explicitly rather than left to the `*` rule. They were already allowed
 * by that blanket rule, but by accident rather than by decision, and "allowed
 * because nobody said otherwise" is not a position — the next person to tighten
 * the wildcard would have cut the shop out of AI answers without realising it.
 *
 * Allowed on purpose: a shopper asking an assistant for hallmarked silver in
 * India is a shopper this shop wants to be named to, and that only happens if
 * these bots can read the catalogue. See `app/llms.txt/route.ts`, which gives
 * them a map of it.
 */
const AI_CRAWLERS = [
  "GPTBot",
  "OAI-SearchBot",
  "ClaudeBot",
  "PerplexityBot",
  "Google-Extended",
  "CCBot",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: ALLOW, disallow: DISALLOW },
      // Same access as everyone else. Sharing the consts is the point: a path
      // added to one rule and not the other is how a private area leaks.
      { userAgent: AI_CRAWLERS, allow: ALLOW, disallow: DISALLOW },
    ],
    sitemap: `${BASE}/sitemap.xml`,
    host: BASE,
  };
}
