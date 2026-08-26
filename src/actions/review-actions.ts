"use server";

import { z } from "zod";
import { revalidatePath, updateTag } from "next/cache";
import { auth } from "@/server/auth/auth";
import { upsertReview, ReviewNotPermittedError } from "@/server/products/reviews";
import { verifyReviewMedia, ReviewMediaError } from "@/server/reviews/media";
import { checkRateLimit, RATE_LIMIT_MESSAGE } from "@/server/rate-limit/limiter";
import { MAX_REVIEW_IMAGES } from "@/lib/review-media";

const reviewSchema = z.object({
  productId: z.string().min(1),
  productSlug: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  title: z.string().trim().max(150).optional().or(z.literal("")),
  comment: z.string().trim().max(1000).optional().or(z.literal("")),
  // Shape only. Whether these URLs are real Cloudinary assets, in the reviews
  // folder, of the right type and under the size limit is decided by
  // verifyReviewMedia — a URL string is a claim, and zod cannot check a claim
  // about a remote file.
  imageUrls: z.array(z.string().url()).max(MAX_REVIEW_IMAGES).optional(),
  videoUrl: z.string().url().nullish(),
});

export async function submitReviewAction(input: unknown) {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false as const, error: "Please sign in to leave a review." };
  }
  if (!(await checkRateLimit("review", session.user.id))) {
    return { ok: false as const, error: RATE_LIMIT_MESSAGE };
  }

  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: "Please choose a rating between 1 and 5." };
  }

  try {
    // Before the write, not after: a review must never be saved pointing at
    // media that turns out to be oversize or fabricated.
    const media = await verifyReviewMedia({
      imageUrls: parsed.data.imageUrls,
      videoUrl: parsed.data.videoUrl,
    });

    await upsertReview({
      userId: session.user.id,
      productId: parsed.data.productId,
      rating: parsed.data.rating,
      title: parsed.data.title || undefined,
      comment: parsed.data.comment || undefined,
      imageUrls: media.imageUrls,
      videoUrl: media.videoUrl,
    });
    revalidatePath(`/products/${parsed.data.productSlug}`);
    // The homepage now shows real 4-and-5-star reviews, so a new one has to
    // drop that cache too — otherwise it waits out the cacheLife.
    updateTag("reviews");
    return { ok: true as const };
  } catch (err) {
    // Only our own, deliberately-worded errors reach the shopper. Anything else
    // (Prisma constraint text, connection failures) gets a generic message
    // rather than leaking internals into the UI.
    if (err instanceof ReviewNotPermittedError || err instanceof ReviewMediaError) {
      return { ok: false as const, error: err.message };
    }
    console.error("submitReviewAction failed", err);
    return { ok: false as const, error: "Could not save your review." };
  }
}
