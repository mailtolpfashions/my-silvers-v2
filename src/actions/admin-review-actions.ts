"use server";

import { revalidatePath, updateTag } from "next/cache";
import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require-role";

/**
 * Moderating a review changes what shoppers see, so every action here has to
 * invalidate the STOREFRONT caches as well as the admin page.
 *
 * ⚠️  `reviews` and `products` are both tagged, and both are needed. The
 * homepage's top-reviews block is cached under `reviews`; the product page's
 * rating average rides along with product data under `products`. Hiding a
 * one-star review and leaving the average showing 3.2 for the next hour is the
 * bug this note exists to prevent.
 */

export type ReviewActionResult = { ok: true } | { ok: false; error: string };

function invalidate(productSlug?: string) {
  updateTag("reviews");
  updateTag("products");
  revalidatePath("/admin/reviews");
  if (productSlug) revalidatePath(`/products/${productSlug}`);
}

/**
 * Show or hide a review.
 *
 * Reversible on purpose — hiding is the first response to anything doubtful,
 * and it should not require the confidence that deleting does.
 */
export async function setReviewPublishedAction(
  id: string,
  isPublished: boolean,
): Promise<ReviewActionResult> {
  await requireRole("admin");

  const review = await prisma.review.update({
    where: { id },
    data: { isPublished },
    select: { product: { select: { slug: true } } },
  });

  invalidate(review.product.slug);
  return { ok: true };
}

/**
 * Delete a review outright.
 *
 * ⚠️  Not the same tool as hiding, and not a tidier version of it. The
 * `@@unique([userId, productId])` constraint means a customer gets exactly one
 * review per product — so deleting theirs lets them write another, while hiding
 * does not. For spam that is the point; for a review you simply disagree with,
 * it hands the writer a fresh attempt. Hide first.
 */
export async function deleteReviewAction(id: string): Promise<ReviewActionResult> {
  await requireRole("admin");

  const review = await prisma.review.delete({
    where: { id },
    select: { product: { select: { slug: true } } },
  });

  invalidate(review.product.slug);
  return { ok: true };
}
