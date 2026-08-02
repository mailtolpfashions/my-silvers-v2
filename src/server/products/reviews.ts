import { prisma } from "@/server/db";

export async function getProductReviews(productId: string) {
  const [reviews, stats] = await Promise.all([
    prisma.review.findMany({
      where: { productId },
      include: { user: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.review.aggregate({
      where: { productId },
      _avg: { rating: true },
      _count: true,
    }),
  ]);
  return {
    reviews,
    averageRating: stats._avg.rating ?? 0,
    count: stats._count,
  };
}

/**
 * One review per user per product (unique constraint) — resubmitting updates
 * the existing review. isVerifiedPurchase is computed HERE, from a delivered
 * order containing the product — never accepted from the client.
 */
export async function upsertReview(input: {
  userId: string;
  productId: string;
  rating: number;
  title?: string;
  comment?: string;
}) {
  const product = await prisma.product.findFirst({
    where: { id: input.productId, isActive: true },
  });
  if (!product) throw new Error("Product not found.");

  const deliveredOrder = await prisma.order.findFirst({
    where: {
      userId: input.userId,
      orderStatus: "delivered",
      items: { some: { productId: input.productId } },
    },
    select: { id: true },
  });

  return prisma.review.upsert({
    where: {
      userId_productId: { userId: input.userId, productId: input.productId },
    },
    update: {
      rating: input.rating,
      title: input.title || null,
      comment: input.comment || null,
      isVerifiedPurchase: !!deliveredOrder,
    },
    create: {
      userId: input.userId,
      productId: input.productId,
      rating: input.rating,
      title: input.title || null,
      comment: input.comment || null,
      isVerifiedPurchase: !!deliveredOrder,
    },
  });
}
