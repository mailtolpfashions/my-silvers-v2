import { prisma } from "@/server/db";

export type ReviewableItem = {
  productId: string;
  slug: string;
  /** Their existing review, when they've already written one. */
  existing: { rating: number; title: string | null; comment: string | null } | null;
};

/**
 * Which items on a delivered order this shopper can review, and what they've
 * already said.
 *
 * Reviewing lives in the order history rather than on the product page, so the
 * control only ever appears for something the shopper actually received. This
 * supplies the two things the UI needs that OrderItem doesn't carry: the
 * product slug (OrderItem stores a name/price snapshot, not a link) and any
 * review they've written before.
 *
 * Returns an empty map for orders that aren't delivered — the review action
 * would refuse anyway, but there's no reason to offer the button.
 */
export async function getReviewableItems(
  orderId: string,
  userId: string
): Promise<Map<string, ReviewableItem>> {
  const order = await prisma.order.findFirst({
    where: { id: orderId, userId, orderStatus: "delivered" },
    select: { items: { select: { id: true, productId: true } } },
  });
  if (!order) return new Map();

  const productIds = order.items.map((i) => i.productId).filter(Boolean) as string[];
  if (productIds.length === 0) return new Map();

  const [products, reviews] = await Promise.all([
    prisma.product.findMany({
      // A delisted product can't be reviewed — upsertReview requires isActive.
      where: { id: { in: productIds }, isActive: true },
      select: { id: true, slug: true },
    }),
    prisma.review.findMany({
      where: { userId, productId: { in: productIds } },
      select: { productId: true, rating: true, title: true, comment: true },
    }),
  ]);

  const reviewByProduct = new Map(reviews.map((r) => [r.productId, r]));

  return new Map(
    products.map((p) => {
      const existing = reviewByProduct.get(p.id);
      return [
        p.id,
        {
          productId: p.id,
          slug: p.slug,
          existing: existing
            ? { rating: existing.rating, title: existing.title, comment: existing.comment }
            : null,
        },
      ];
    })
  );
}
