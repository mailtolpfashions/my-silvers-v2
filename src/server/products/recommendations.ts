import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "@/server/db";
import { toProductListItem, type ProductListItem } from "@/server/products/search";

/**
 * Add-on suggestions for the cart.
 *
 * Deliberately budget-aware rather than random: shoppers add a second piece
 * when it feels small next to what they're already spending, so the ceiling
 * scales with the cart. Bestsellers rank first, then new arrivals.
 *
 * This is a heuristic, not purchase data. Once enough orders exist, the same
 * function can be swapped for real co-purchase counts from OrderItem without
 * touching the UI.
 */

/** Suggestions cost at most this share of the cart subtotal. */
const BUDGET_SHARE = 0.5;
/** Always allow at least this, so a small cart still gets suggestions. */
const MIN_CEILING = 1500;
/** Never suggest above this — past it, it's a second purchase, not an add-on. */
const MAX_CEILING = 3500;

export type CartRecommendations = {
  items: ProductListItem[];
  /** Rupees — used for the "under ₹X" hint in the heading. */
  ceiling: number;
};

export async function getCartRecommendations({
  excludeProductIds,
  subtotalPaise,
  take = 4,
}: {
  excludeProductIds: string[];
  subtotalPaise: number;
  take?: number;
}): Promise<CartRecommendations> {
  const subtotalRupees = subtotalPaise / 100;
  const ceiling = Math.round(
    Math.min(MAX_CEILING, Math.max(MIN_CEILING, subtotalRupees * BUDGET_SHARE))
  );

  const products = await prisma.product.findMany({
    where: {
      isActive: true,
      stock: { gt: 0 },
      id: { notIn: excludeProductIds },
      price: { lte: ceiling },
    },
    include: { category: true },
    orderBy: [{ isBestseller: "desc" }, { isFeatured: "desc" }, { createdAt: "desc" }],
    take,
  });

  // The shared mapper, not a hand-rolled literal — this one drifted the moment
  // ProductListItem gained a field.
  return { ceiling, items: products.map(toProductListItem) };
}

/**
 * "See similar" — the same category, nearest in price.
 *
 * Ordered by absolute price distance from the product being viewed: someone
 * looking at a ₹1,200 ring is shopping a price bracket as much as a category,
 * and the nearest neighbours are the useful comparison. Raw SQL because Prisma
 * can't order by an expression over a bound parameter.
 */
export async function getSimilarProducts({
  productId,
  categoryId,
  priceRupees,
  take = 4,
}: {
  productId: string;
  categoryId: string;
  priceRupees: number;
  take?: number;
}): Promise<ProductListItem[]> {
  "use cache";
  cacheLife("hours");
  cacheTag("products");

  const rows = await prisma.$queryRaw<
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
  >`
    SELECT p."id", p."name", p."slug", p."price"::text,
           p."compareAtPrice"::text as "compareAtPrice",
           p."images", p."isBestseller", p."isFeatured", p."stock",
           c."name" as "categoryName",
           COALESCE(array_length(p."sizes", 1), 0) > 0 as "requiresSize"
    FROM "Product" p
    JOIN "Category" c ON c."id" = p."categoryId"
    WHERE p."isActive" = true
      AND p."stock" > 0
      AND p."categoryId" = ${categoryId}
      AND p."id" <> ${productId}
    ORDER BY ABS(p."price" - ${priceRupees}::numeric) ASC, p."isBestseller" DESC
    LIMIT ${take}
  `;

  return rows;
}

/**
 * "You may also like" — deliberately OUTSIDE the current category.
 *
 * Similar products already cover "more of the same". This is the cross-sell:
 * someone buying a ring may well want the matching earrings, and showing them
 * six more rings doesn't help. Bestsellers first, since with no purchase graph
 * yet that is the best available signal.
 */
export async function getAlsoLikeProducts({
  productId,
  categoryId,
  take = 4,
}: {
  productId: string;
  categoryId: string;
  take?: number;
}): Promise<ProductListItem[]> {
  "use cache";
  cacheLife("hours");
  cacheTag("products");

  const products = await prisma.product.findMany({
    where: {
      isActive: true,
      stock: { gt: 0 },
      id: { not: productId },
      categoryId: { not: categoryId },
    },
    include: { category: true },
    orderBy: [{ isBestseller: "desc" }, { isFeatured: "desc" }, { createdAt: "desc" }],
    take,
  });

  return products.map(toProductListItem);
}
