import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "@/server/db";
import { withBlurPlaceholders } from "@/server/media/blur";

export type ProductListItem = {
  id: string;
  name: string;
  slug: string;
  price: string;
  compareAtPrice: string | null;
  images: string[];
  isBestseller: boolean;
  isFeatured: boolean;
  /** Raw count — never render it directly, use src/lib/stock-label.ts. */
  stock: number;
  categoryName: string;
  /**
   * Whether the piece is sold in sizes, and therefore cannot be added to a cart
   * without one.
   *
   * A boolean rather than the `sizes` array itself: a listing card only has to
   * decide between adding the piece and sending the shopper to the selector, and
   * the labels themselves live on the product page. Carrying the array would put
   * a string list on every row of every cached listing to answer a yes/no
   * question. See src/server/cart.ts, which rejects a sized product outright
   * when no size is supplied — roughly two thirds of this catalogue.
   */
  requiresSize: boolean;
  /**
   * Blurred preview of `images[0]`, inlined as a data URI, for next/image's
   * `placeholder="blur"`.
   *
   * Optional and attached late, by `withBlurPlaceholders` in
   * src/server/media/blur.ts — a producer that does not bother simply renders a
   * plain tile. It is NOT resolved inside ProductCard, and cannot be: the card
   * is imported by product-grid.tsx, which is a client component, so the card
   * is in the browser bundle on listing pages and has no way to reach the
   * server. The value has to arrive as data.
   */
  blurDataUrl?: string;
};

export async function searchProducts(params: {
  q?: string;
  categorySlug?: string;
  sort?: "newest" | "price-asc" | "price-desc" | "featured";
  /** Rupees, inclusive. Ignored when not a finite non-negative number. */
  minPrice?: number;
  maxPrice?: number;
  page?: number;
  pageSize?: number;
}): Promise<{ items: ProductListItem[]; total: number }> {
  // Clamp to sane integers — `page` often comes straight from a URL query
  // param, so NaN/negative/huge values must not reach LIMIT/OFFSET.
  const page = Math.max(1, Math.trunc(Number(params.page) || 1));
  const pageSize = Math.min(60, Math.max(1, Math.trunc(Number(params.pageSize) || 24)));
  const offset = (page - 1) * pageSize;

  const orderBy =
    params.sort === "price-asc"
      ? `p."price" ASC`
      : params.sort === "price-desc"
        ? `p."price" DESC`
        : params.sort === "featured"
          ? `p."isFeatured" DESC, p."createdAt" DESC`
          : `p."createdAt" DESC`;

  // Raw SQL is required here: full-text search against the generated
  // `searchVector` tsvector column (not represented in schema.prisma — see
  // prisma/migrations for the column/index) is not expressible via the
  // Prisma query builder.
  // Sold-out pieces are hidden from every storefront listing. They stay
  // reachable at their own URL, so existing links, wishlists and search engine
  // results don't break — the product page shows "Out of stock" instead.
  const whereClauses: string[] = [`p."isActive" = true`, `p."stock" > 0`];
  const values: unknown[] = [];

  if (params.q && params.q.trim().length > 0) {
    values.push(params.q.trim());
    whereClauses.push(`p."searchVector" @@ websearch_to_tsquery('english', $${values.length})`);
  }

  if (params.categorySlug) {
    values.push(params.categorySlug);
    whereClauses.push(`c."slug" = $${values.length}`);
  }

  // Price bounds arrive from the URL, so anything non-numeric or negative is
  // dropped rather than reaching the query.
  const minPrice = Number(params.minPrice);
  if (Number.isFinite(minPrice) && minPrice > 0) {
    values.push(minPrice);
    whereClauses.push(`p."price" >= $${values.length}`);
  }

  const maxPrice = Number(params.maxPrice);
  if (Number.isFinite(maxPrice) && maxPrice > 0) {
    values.push(maxPrice);
    whereClauses.push(`p."price" <= $${values.length}`);
  }

  const whereSql = whereClauses.join(" AND ");

  // Snapshot before LIMIT/OFFSET join the list — the count query shares the
  // WHERE clause but takes none of the pagination params.
  const whereValues = [...values];

  values.push(pageSize, offset);
  const limitParam = values.length - 1;
  const offsetParam = values.length;

  // The two queries are independent; running them sequentially doubled the
  // latency of every listing page for no reason.
  const [rows, countRows] = await Promise.all([
    prisma.$queryRawUnsafe<
      Array<{
        id: string;
        name: string;
        slug: string;
        price: string;
        compareAtPrice: string | null;
        images: string[];
        isBestseller: boolean;
        isFeatured: boolean;
        stock: number;
        categoryName: string;
        requiresSize: boolean;
      }>
    >(
      // `sizes` is a text[]; array_length returns NULL rather than 0 for an
      // empty array, hence the COALESCE. Computed in SQL so the array itself
      // never crosses the wire.
      `SELECT p."id", p."name", p."slug", p."price"::text, p."compareAtPrice"::text as "compareAtPrice",
              p."images", p."isBestseller", p."isFeatured", p."stock", c."name" as "categoryName",
              COALESCE(array_length(p."sizes", 1), 0) > 0 as "requiresSize"
       FROM "Product" p
       JOIN "Category" c ON c."id" = p."categoryId"
       WHERE ${whereSql}
       ORDER BY ${orderBy}
       LIMIT $${limitParam} OFFSET $${offsetParam}`,
      ...values
    ),
    prisma.$queryRawUnsafe<Array<{ count: string }>>(
      `SELECT COUNT(*)::text as count
       FROM "Product" p
       JOIN "Category" c ON c."id" = p."categoryId"
       WHERE ${whereSql}`,
      ...whereValues
    ),
  ]);

  // Blurred previews last, on the page of rows we are actually returning —
  // never inside the SQL, and never for the count query.
  return {
    items: await withBlurPlaceholders(rows),
    total: Number(countRows[0]?.count ?? 0),
  };
}

/**
 * One product, by slug, for the product page and its metadata.
 *
 * ── Why `"use cache"` and not React's `cache()` ──────────────────────────────
 * ⚠️  It was `cache()` from react, and under Cache Components that is not the
 * same thing at all. `cache()` dedupes calls WITHIN one request; it does not
 * make the read a cached data access, so Next still refused to prerender a
 * shell for /products/[slug] and reported:
 *
 *   Route "/products/[slug]": Next.js encountered uncached data during
 *   prerendering or a navigation.
 *
 * It surfaced from `generateMetadata`, which is the half that cannot be fixed
 * by streaming — a `<Suspense>` boundary has nowhere to go in a function that
 * returns a Metadata object. Caching is the only remedy that applies, and it
 * is legitimate here: a product keyed by slug is the same for every shopper.
 *
 * ── Decimals become strings, and that is load-bearing ────────────────────────
 * A cached function's return value has to survive serialization, and Prisma
 * hands back `Decimal` class instances for price, compareAtPrice, costPrice
 * and weight. Those do not survive it. They are converted here, which is also
 * why this returns a mapped object rather than the raw row.
 *
 * Nothing downstream had to change: the two components that take the whole
 * product type these fields structurally as `{ toString(): string }`, which a
 * string satisfies, and `.toString()` on a string is a no-op.
 *
 * ── Staleness ────────────────────────────────────────────────────────────────
 * Tagged `products`, which every admin product and category action already
 * invalidates via updateTag, and which fulfilment revalidates when stock moves.
 * The per-slug tag is there for a future narrower invalidation. Within the
 * window, a shopper can see a stock count that is a little behind — the same
 * trade every cached listing on this site already makes, and safe because
 * stock is enforced by a conditional UPDATE at order time, not by what the page
 * displayed.
 */
export async function getProductBySlug(slug: string) {
  "use cache";
  cacheLife("hours");
  cacheTag("products", `products:slug:${slug}`);

  const product = await prisma.product.findFirst({
    where: { slug, isActive: true },
    include: { category: true, variants: true },
  });
  if (!product) return null;

  return {
    ...product,
    price: product.price.toString(),
    compareAtPrice: product.compareAtPrice?.toString() ?? null,
    costPrice: product.costPrice?.toString() ?? null,
    weight: product.weight?.toString() ?? null,
  };
}

/**
 * Products belonging to a collection.
 *
 * Collections are CMS entries with no Prisma relation to Product, so membership
 * rides on `Product.tags` — a field that already existed, is admin-editable,
 * and was read by nothing. The collection entry names a tag; every active,
 * in-stock product carrying it belongs.
 *
 * The trade-off, stated plainly: ordering is by the same rules as any listing,
 * not hand-curated. If merchandising later needs curated order, the upgrade is
 * a ProductCollection join table with an explicit sortOrder.
 */
export async function getProductsByTag(tag: string, take = 12): Promise<ProductListItem[]> {
  "use cache";
  cacheLife("hours");
  cacheTag("products", `products:tag:${normaliseTag(tag)}`);

  const products = await prisma.product.findMany({
    // Matches every other listing: sold-out pieces never appear in a grid.
    where: { isActive: true, stock: { gt: 0 }, tags: { has: normaliseTag(tag) } },
    include: { category: true },
    orderBy: [{ isFeatured: "desc" }, { createdAt: "desc" }],
    take: Math.min(60, Math.max(1, Math.trunc(take) || 12)),
  });

  return withBlurPlaceholders(products.map(toProductListItem));
}

/** Tags are stored lower-cased on write (see server/products/admin.ts). */
function normaliseTag(tag: string) {
  return tag.trim().toLowerCase();
}

/** The single Prisma-row → card shape mapping, shared by every product query. */
export function toProductListItem(p: {
  id: string;
  name: string;
  slug: string;
  price: { toString(): string };
  compareAtPrice: { toString(): string } | null;
  images: string[];
  isBestseller: boolean;
  isFeatured: boolean;
  stock: number;
  category: { name: string };
  sizes: string[];
}): ProductListItem {
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    price: p.price.toString(),
    compareAtPrice: p.compareAtPrice?.toString() ?? null,
    images: p.images,
    isBestseller: p.isBestseller,
    isFeatured: p.isFeatured,
    requiresSize: p.sizes.length > 0,
    stock: p.stock,
    categoryName: p.category.name,
  };
}

/**
 * Cached rather than merely deduped: the header renders this on every single
 * storefront page, and the catalogue's categories change perhaps monthly.
 * Invalidated by src/actions/admin-category-actions.ts.
 */
export async function getActiveCategories() {
  "use cache";
  cacheLife("days");
  cacheTag("categories");

  return prisma.category.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
  });
}
