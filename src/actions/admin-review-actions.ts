"use server";

import { revalidatePath, updateTag } from "next/cache";
import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require-role";
import { destroyReviewMedia } from "@/server/reviews/media";
import type { ReviewStatus } from "@/generated/prisma/enums";

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
 * Approve or reject a review — the whole moderation gate.
 *
 * Both directions are reversible and neither asks for confirmation, which is
 * the point of having `rejected` as a state rather than reaching for delete:
 * rejecting takes a review off the storefront and OUT of the pending queue
 * without destroying anything, so a wrong call costs one click to undo and the
 * customer keeps their words. Delete is the tool that cannot be undone; this is
 * not a milder version of it.
 */
export async function setReviewStatusAction(
  id: string,
  status: ReviewStatus,
): Promise<ReviewActionResult> {
  await requireRole("admin");

  const review = await prisma.review.update({
    where: { id },
    data: { status },
    select: { product: { select: { slug: true } } },
  });

  invalidate(review.product.slug);
  return { ok: true };
}

/**
 * Delete a review outright.
 *
 * ⚠️  Not the same tool as rejecting, and not a tidier version of it. The
 * `@@unique([userId, productId])` constraint means a customer gets exactly one
 * review per product — so deleting theirs lets them write another, and the
 * replacement arrives back in the pending queue for someone to read again.
 * Rejecting does not: it is terminal and silent. For spam, freeing the slot is
 * the wrong outcome twice over; for a review you simply disagree with, it hands
 * the writer a fresh attempt. Reject first.
 *
 * Any attached photos and video go with it. That matters most in the case this
 * button is actually reached for — someone uploading something that does not
 * belong on the shop. Deleting the row while leaving the image live on the
 * Cloudinary CDN, still reachable by anyone holding the URL, would be a
 * takedown that took nothing down.
 */
export async function deleteReviewAction(id: string): Promise<ReviewActionResult> {
  await requireRole("admin");

  const review = await prisma.review.delete({
    where: { id },
    select: { product: { select: { slug: true } }, imageUrl: true },
  });

  // Awaited, unlike the edit-time cleanup in upsertReview. There the media was
  // merely superseded; here it is the point of the action, and a moderator is
  // entitled to know it finished. destroyReviewMedia swallows its own failures,
  // so this cannot fail the delete — it only makes it take as long as it takes.
  await destroyReviewMedia([review.imageUrl]);

  invalidate(review.product.slug);
  return { ok: true };
}

/**
 * Approve or reject many reviews at once.
 *
 * This is the control that makes approval survivable. Reviews now arrive
 * unapproved, so a shop that gets twenty in a week has twenty clicks of work
 * before any of them count as social proof — and a queue that costs that much
 * is a queue that stops being emptied. Working through a page of pending
 * reviews and approving the whole selection is the ordinary case, not the
 * exception it was when this only existed for sweeping up spam.
 *
 * ⚠️  Bulk APPROVE and REJECT only — there is deliberately no bulk delete.
 * Both of these are reversible, so getting a selection wrong costs a second
 * click; deleting is not, and it also frees each of those customers to write a
 * fresh review. A mis-selected bulk delete would be unrecoverable and would
 * invite replacement reviews from people who had already had their say. Delete
 * stays one at a time, behind its own confirmation.
 *
 * The absence of a bulk delete is also why nothing here has to destroy media:
 * neither state change touches the review's photos.
 *
 * `updateMany` rather than a loop: one statement, and the whole selection moves
 * or none of it does.
 */
export async function bulkSetReviewStatusAction(
  ids: string[],
  status: ReviewStatus,
): Promise<ReviewActionResult> {
  await requireRole("admin");

  if (ids.length === 0) return { ok: false, error: "Nothing selected." };
  // A ceiling, because the ids arrive from the browser. Well past any real
  // selection, low enough that a malformed request cannot ask for the world.
  if (ids.length > 200) return { ok: false, error: "Too many at once — select fewer." };

  await prisma.review.updateMany({ where: { id: { in: ids } }, data: { status } });

  // No product slug to revalidate: a bulk change can span dozens of products,
  // so the tags do the work and the storefront picks it all up.
  invalidate();
  return { ok: true };
}
