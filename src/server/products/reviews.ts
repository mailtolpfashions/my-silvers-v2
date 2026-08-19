import { prisma } from "@/server/db";

/** Thrown when someone tries to review a product they have not had delivered. */
export class ReviewNotPermittedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReviewNotPermittedError";
  }
}

export async function getProductReviews(productId: string) {
  const [reviews, stats] = await Promise.all([
    prisma.review.findMany({
      // isPublished on BOTH reads, not just the list: a hidden review that
      // still moves the star average is only half hidden.
      where: { productId, isPublished: true },
      include: { user: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.review.aggregate({
      where: { productId, isPublished: true },
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

  // A delivered order is now REQUIRED, not merely recorded. This used to accept
  // a review from any signed-in account and flag it isVerifiedPurchase: false —
  // which meant the review count on a product could be inflated by people who
  // had never owned it. Every review in the system is now a real buyer's.
  if (!deliveredOrder) {
    throw new ReviewNotPermittedError(
      "You can review a piece once your order for it has been delivered."
    );
  }

  return prisma.review.upsert({
    where: {
      userId_productId: { userId: input.userId, productId: input.productId },
    },
    update: {
      rating: input.rating,
      title: input.title || null,
      comment: input.comment || null,
      isVerifiedPurchase: true,
    },
    create: {
      userId: input.userId,
      productId: input.productId,
      rating: input.rating,
      title: input.title || null,
      comment: input.comment || null,
      isVerifiedPurchase: true,
    },
  });
}
