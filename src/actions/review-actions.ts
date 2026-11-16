"use server";

import { z } from "zod";
import { revalidatePath, updateTag } from "next/cache";
import { auth } from "@/server/auth/auth";
import { upsertReview, ReviewNotPermittedError } from "@/server/products/reviews";
import { verifyReviewImage, ReviewMediaError } from "@/server/reviews/media";
import { checkRateLimit, RATE_LIMIT_MESSAGE } from "@/server/rate-limit/limiter";
import { isGuestAccess, resolveGuestOrder } from "@/server/orders/guest-access";

const reviewSchema = z.object({
  productId: z.string().min(1),
  productSlug: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  title: z.string().trim().max(150).optional().or(z.literal("")),
  comment: z.string().trim().max(1000).optional().or(z.literal("")),
  // Shape only. Whether this URL is a real Cloudinary asset, sitting in the
  // reviews folder, an image rather than a clip, and under the size limit is
  // decided by verifyReviewImage — a URL string is a claim, and zod cannot
  // check a claim about a remote file.
  imageUrl: z.string().url().nullish(),
});

export async function submitReviewAction(input: unknown) {
  /**
   * Who is reviewing: a guest holding their order link (the link's token,
   * checked here against a DELIVERED order), or a signed-in account. A guest's
   * review is saved on their order's own user record, and the purchase is
   * proven by that one order — see server/orders/guest-access.ts.
   */
  const guest =
    typeof input === "object" && input !== null && isGuestAccess((input as { guest?: unknown }).guest)
      ? await resolveGuestOrder((input as { guest: { orderId: string; token: string } }).guest, { delivered: true })
      : null;
  const session = guest ? null : await auth();
  const reviewer = guest
    ? { userId: guest.userId, pwf: undefined, viaOrderId: guest.orderId }
    : session?.user?.id
      ? { userId: session.user.id, pwf: session.user.pwf, viaOrderId: undefined }
      : null;
  if (!reviewer) {
    return { ok: false as const, error: "Please sign in to leave a review." };
  }
  if (!(await checkRateLimit("review", reviewer.userId))) {
    return { ok: false as const, error: RATE_LIMIT_MESSAGE };
  }

  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: "Please choose a rating between 1 and 5." };
  }

  try {
    // Before the write, not after: a review must never be saved pointing at a
    // photo that turns out to be oversize, fabricated, or a video.
    const imageUrl = await verifyReviewImage(parsed.data.imageUrl);

    await upsertReview({
      userId: reviewer.userId,
      pwf: reviewer.pwf,
      viaOrderId: reviewer.viaOrderId,
      productId: parsed.data.productId,
      rating: parsed.data.rating,
      title: parsed.data.title || undefined,
      comment: parsed.data.comment || undefined,
      imageUrl,
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
