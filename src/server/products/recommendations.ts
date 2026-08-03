import { prisma } from "@/server/db";
import type { ProductListItem } from "@/server/products/search";

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

  return {
    ceiling,
    items: products.map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      price: p.price.toString(),
      compareAtPrice: p.compareAtPrice?.toString() ?? null,
      images: p.images,
      isBestseller: p.isBestseller,
      isFeatured: p.isFeatured,
      stock: p.stock,
      categoryName: p.category.name,
    })),
  };
}
