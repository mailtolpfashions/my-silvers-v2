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

/**
 * Show or hide many reviews at once.
 *
 * ⚠️  Bulk HIDE and SHOW only — there is deliberately no bulk delete. Hiding is
 * reversible, so getting a selection wrong costs a second click; deleting is
 * not, and it also frees each of those customers to write a fresh review. A
 * mis-selected bulk delete would be unrecoverable and would invite replacement
 * reviews from people who had already had their say. Delete stays one at a
 * time, behind its own confirmation.
 *
 * `updateMany` rather than a loop: one statement, and the whole selection moves
 * or none of it does.
 */
export async function bulkSetReviewPublishedAction(
  ids: string[],
  isPublished: boolean,
): Promise<ReviewActionResult> {
  await requireRole("admin");

  if (ids.length === 0) return { ok: false, error: "Nothing selected." };
  // A ceiling, because the ids arrive from the browser. Well past any real
  // selection, low enough that a malformed request cannot ask for the world.
  if (ids.length > 200) return { ok: false, error: "Too many at once — select fewer." };

  await prisma.review.updateMany({ where: { id: { in: ids } }, data: { isPublished } });

  // No product slug to revalidate: a bulk change can span dozens of products,
  // so the tags do the work and the storefront picks it all up.
  invalidate();
  return { ok: true };
}
