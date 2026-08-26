import { prisma } from "@/server/db";
import { destroyReviewMedia } from "@/server/reviews/media";

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
      // `approved` on BOTH reads, not just the list: a review awaiting approval
      // that still moves the star average is only half hidden. Note this is an
      // allowlist of one state, not `status: { not: "rejected" }` — written
      // that way so a future fourth state cannot become visible by default.
      where: { productId, status: "approved" },
      include: { user: { select: { name: true } } },
      /**
       * ⚠️  Photo-bearing reviews first, then newest — and `nulls: "last"` is
       * doing real work, not decorating.
       *
       * Postgres defaults a DESC sort to NULLS FIRST, so a bare
       * `imageUrl: "desc"` would float every review WITHOUT a photo to the top:
       * the exact opposite of what the grid is for. Prisma exposes the
       * override, so the intent is stated rather than inherited.
       *
       * Ordering here rather than in the component because of `take` below —
       * sorting after the fact would let a photo review sitting at position 51
       * be cut before it could be promoted.
       */
      orderBy: [{ imageUrl: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      take: 50,
    }),
    prisma.review.aggregate({
      where: { productId, status: "approved" },
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
  /** Already verified against Cloudinary — see server/reviews/media.ts. */
  imageUrl?: string | null;
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

  const imageUrl = input.imageUrl ?? null;

  // What they had attached before this edit, so a replaced or removed photo can
  // be cleared out of Cloudinary rather than left paid-for and unreachable.
  const previous = await prisma.review.findUnique({
    where: {
      userId_productId: { userId: input.userId, productId: input.productId },
    },
    select: { imageUrl: true },
  });

  const review = await prisma.review.upsert({
    where: {
      userId_productId: { userId: input.userId, productId: input.productId },
    },
    update: {
      rating: input.rating,
      title: input.title || null,
      comment: input.comment || null,
      imageUrl,
      isVerifiedPurchase: true,
      /**
       * ⚠️  An edit ALWAYS returns the review to the queue — including one that
       * was already approved, and including one that was rejected.
       *
       * Without this the approval gate is bypassable in two moves: write
       * something unobjectionable, wait for approval, then edit it to say
       * anything at all. The approved flag would still be set and the new text
       * would go straight to the storefront. So approval attaches to the words
       * that were read, not to the row.
       *
       * The cost is real and is accepted: fixing a typo in an approved review
       * takes it off the storefront until someone looks again. A moderator
       * cannot tell an innocent re-edit from a bait-and-switch, so neither can
       * the code.
       */
      status: "pending",
    },
    create: {
      userId: input.userId,
      productId: input.productId,
      rating: input.rating,
      title: input.title || null,
      comment: input.comment || null,
      imageUrl,
      isVerifiedPurchase: true,
    },
  });

  // AFTER the write, and deliberately not awaited. Running it first would mean
  // a failed upsert had already destroyed media the surviving review still
  // points at; awaiting it would let a slow Cloudinary hold up a review that is
  // already saved. An orphaned file is a cost that can be swept up later; a
  // review rendering a dead image is a bug the shopper sees.
  if (previous?.imageUrl && previous.imageUrl !== imageUrl) {
    void destroyReviewMedia([previous.imageUrl]);
  }

  return review;
}
