import "server-only";
import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require-role";

/**
 * The moderation queue.
 *
 * ⚠️  This screen used to be optional. It is not any more.
 *
 * Reviews once went live as they were written and this was an after-the-fact
 * tool — its default view was "everything, newest first" because there was no
 * pending state to empty. Approval changed that: nothing a customer writes
 * reaches the storefront until someone opens this page, so the default view is
 * now the PENDING queue, and an unattended queue is now indistinguishable from
 * a shop with no reviews.
 *
 * getAttentionItems puts the pending count on the dashboard for that reason.
 */

export type ReviewFilter = "pending" | "all" | "approved" | "rejected" | "unverified";

/** How many rows one page of the moderation table holds. */
export const REVIEW_PAGE_SIZE = 30;

function whereFor(filter: ReviewFilter, q: string | undefined) {
  const search = q?.trim();
  return {
    ...(filter === "pending" ? { status: "pending" as const } : {}),
    ...(filter === "approved" ? { status: "approved" as const } : {}),
    ...(filter === "rejected" ? { status: "rejected" as const } : {}),
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
  filter = "pending",
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
      /**
       * Pending first, then approved, then rejected — which is what ascending
       * order on the enum gives, because Postgres sorts an enum by DECLARATION
       * order rather than alphabetically.
       *
       * ⚠️  That makes this line quietly dependent on the order of the values
       * in `enum ReviewStatus`. Reordering them there silently reorders this
       * screen. They are declared in workflow order for exactly this reason.
       */
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
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
  // groupBy rather than one count per state: three states now, and a fourth
  // would otherwise mean a fourth round trip.
  const [all, byStatus, unverified] = await Promise.all([
    prisma.review.count(),
    prisma.review.groupBy({ by: ["status"], _count: true }),
    prisma.review.count({ where: { isVerifiedPurchase: false } }),
  ]);

  const countFor = (status: "pending" | "approved" | "rejected") =>
    byStatus.find((row) => row.status === status)?._count ?? 0;

  return {
    all,
    pending: countFor("pending"),
    approved: countFor("approved"),
    rejected: countFor("rejected"),
    unverified,
  };
}
