import { NextRequest } from "next/server";
import { prisma } from "@/server/db";

/**
 * Typeahead suggestions for the header search box.
 *
 * Uses ILIKE rather than the `searchVector` full-text column: tsquery matches
 * whole lexemes, so "oxi" would never match "oxidised" — useless while someone
 * is still typing. Full-text still powers the actual results page.
 *
 * Only public catalogue data is returned, and sold-out pieces are excluded to
 * match the storefront listings.
 */
/**
 * Shared-cache headers, and the reason this route needed them.
 *
 * Typeahead traffic is the most repetitive on the site: everyone reaching for
 * the same catalogue types the same prefixes, so "sil", "silv" and "silver"
 * arrive over and over from different people. Uncached, every one of those was
 * two database round trips.
 *
 * `s-maxage` is a SHARED-cache directive, so Vercel's edge answers the repeats
 * and the origin — and the connection pool behind it — only sees the first of
 * each term per minute. Nothing per-shopper is returned (public catalogue rows,
 * filtered to active and in-stock), so this is safe to cache publicly.
 *
 * 60s means a newly published product can take a minute to appear in the
 * dropdown while already being on the listing page. That is the trade, and it
 * is the right way round: suggestions are a convenience, and the search results
 * page they lead to is not cached.
 *
 * `stale-while-revalidate` lets the edge keep answering instantly while it
 * refreshes behind the scenes, so the refresh is never in a shopper's way.
 */
const CACHE_CONTROL = "public, s-maxage=60, stale-while-revalidate=300";

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();

  // Below two characters every query matches almost everything.
  if (q.length < 2) {
    // The most cacheable answer there is: it depends on nothing at all.
    return Response.json(
      { products: [], categories: [] },
      { headers: { "cache-control": "public, s-maxage=3600, stale-while-revalidate=86400" } }
    );
  }

  // Cap the input so a pathological string can't drive an expensive scan, and
  // escape LIKE wildcards — Prisma's `contains` passes % and _ straight
  // through, so a query of "%%%" would otherwise match the entire catalogue.
  const term = q.slice(0, 60).replace(/[%_\\]/g, (ch) => `\\${ch}`);

  try {
    const [products, categories] = await Promise.all([
      prisma.product.findMany({
        where: {
          isActive: true,
          stock: { gt: 0 },
          name: { contains: term, mode: "insensitive" },
        },
        select: { id: true, name: true, slug: true, images: true, price: true },
        orderBy: [{ isBestseller: "desc" }, { createdAt: "desc" }],
        take: 6,
      }),
      prisma.category.findMany({
        where: { isActive: true, name: { contains: term, mode: "insensitive" } },
        select: { name: true, slug: true },
        orderBy: { sortOrder: "asc" },
        take: 3,
      }),
    ]);

    return Response.json(
      {
        products: products.map((p) => ({
          id: p.id,
          name: p.name,
          slug: p.slug,
          image: p.images[0] ?? null,
          price: p.price.toString(),
        })),
        categories,
      },
      { headers: { "cache-control": CACHE_CONTROL } }
    );
  } catch (err) {
    /**
     * A typeahead must never fail loudly.
     *
     * Measured in the audit's load test (Phase 5): this route began returning
     * 500s at 60 concurrent requests and was failing 53% of them at 100, while
     * /products absorbed 220 concurrent without a single error. The difference
     * is that each request here holds TWO pooled connections at once — the
     * Promise.all above — against `db.ts`'s pool of 5 per instance, on the one
     * endpoint that fires while someone is typing.
     *
     * Caching is the real fix (see CACHE_CONTROL). This is the floor under it:
     * if the pool is exhausted anyway, an empty suggestion list is a dropdown
     * that shows nothing, which the UI already handles. A 500 is a console full
     * of errors and a search box that looks broken — for a feature nobody
     * needed to complete their purchase.
     */
    console.error("[search/suggestions] lookup failed — returning empty", err);
    return Response.json(
      { products: [], categories: [] },
      { headers: { "cache-control": "no-store" } }
    );
  }
}
