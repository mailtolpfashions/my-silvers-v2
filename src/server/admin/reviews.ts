import "server-only";
import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require-role";

/**
 * The moderation queue.
 *
 * Reviews go live as they are written — see the note on Review.isPublished —
 * so this is an after-the-fact tool, and its default view is deliberately
 * "everything, newest first" rather than a pending queue. There is no pending
 * state to empty.
 */

export type ReviewFilter = "all" | "published" | "hidden" | "unverified";

/** How many rows one page of the moderation table holds. */
export const REVIEW_PAGE_SIZE = 30;

function whereFor(filter: ReviewFilter, q: string | undefined) {
  const search = q?.trim();
  return {
    ...(filter === "published" ? { isPublished: true } : {}),
    ...(filter === "hidden" ? { isPublished: false } : {}),
    // Written by someone with no delivered order for the piece. These are the
    // ones worth a second look — upsertReview refuses them now, but reviews
    // written before that rule still exist.
    ...(filter === "unverified" ? { isVerifiedPurchase: false } : {}),
    ...(search
      ? {
          OR: [
            { comment: { contains: search, mode: "insensitive" as const } },
            { title: { contains: search, mode: "insensitive" as const } },
            { product: { name: { contains: search, mode: "insensitive" as const } } },
            { user: { email: { contains: search, mode: "insensitive" as const } } },
            { user: { name: { contains: search, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };
}

export async function listReviews({
  filter = "all",
  q,
  page = 1,
}: {
  filter?: ReviewFilter;
  q?: string;
  page?: number;
}) {
  await requireRole("admin");
  const where = whereFor(filter, q);
  const skip = (Math.max(1, page) - 1) * REVIEW_PAGE_SIZE;

  const [rows, total] = await Promise.all([
    prisma.review.findMany({
      where,
      // Hidden first: if someone is on this screen, the thing they most likely
      // came to check is what is currently suppressed.
      orderBy: [{ isPublished: "asc" }, { createdAt: "desc" }],
      skip,
      take: REVIEW_PAGE_SIZE,
      include: {
        user: { select: { id: true, name: true, email: true } },
        product: { select: { id: true, name: true, slug: true, images: true } },
      },
    }),
    prisma.review.count({ where }),
  ]);

  return { rows, total, page: Math.max(1, page), pageSize: REVIEW_PAGE_SIZE };
}

/** Counts for the filter tabs, so each says how much is behind it. */
export async function reviewCounts() {
  await requireRole("admin");
  const [all, hidden, unverified] = await Promise.all([
    prisma.review.count(),
    prisma.review.count({ where: { isPublished: false } }),
    prisma.review.count({ where: { isVerifiedPurchase: false } }),
  ]);
  return { all, published: all - hidden, hidden, unverified };
}
