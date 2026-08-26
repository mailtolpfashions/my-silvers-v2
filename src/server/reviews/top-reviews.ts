import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "@/server/db";

/** Below this, a comment is a rating with words attached, not a testimonial. */
const MIN_COMMENT_LENGTH = 25;

export type TopReview = {
  id: string;
  rating: number;
  title: string | null;
  comment: string;
  authorName: string;
  createdAt: Date;
  /**
   * The reviewer's own first photo, when they attached one.
   *
   * Kept separate from `product.image` rather than collapsed into a single
   * "thumbnail" field, so the component can fall back on its own and so the
   * two are never confused at the call site: one is a catalogue photograph we
   * shot, the other is a customer's phone picture of the piece they bought.
   */
  customerImage: string | null;
  product: { name: string; slug: string; image: string | null };
};

/**
 * Real 4-and-5-star reviews for the homepage.
 *
 * Replaces a CMS `testimonials` field that let anyone type any quote and any
 * name — social proof nobody could check. These are written by signed-in
 * customers against a specific product, and each one links to that product, so
 * a shopper can go read the rest of its reviews and see the claim in context.
 *
 * Only reviews that actually say something are eligible: a bare 5 stars with no
 * comment is fine on a product page but is not a testimonial.
 */
export async function getTopReviews(take = 6): Promise<TopReview[]> {
  "use cache";
  cacheLife("hours");
  cacheTag("reviews", "products");

  const reviews = await prisma.review.findMany({
    where: {
      rating: { gte: 4 },
      comment: { not: null },
      // Buyers only. upsertReview now refuses a review without a delivered
      // order, but reviews written before that rule still exist — this keeps
      // them off the homepage regardless.
      isVerifiedPurchase: true,
      // A delisted product would send the shopper to a dead end.
      // Approved by a moderator — see Review.status.
      status: "approved",
      product: { isActive: true },
    },
    // Best first, so the per-product de-dupe below keeps each product's best
    // review rather than an arbitrary one.
    orderBy: [{ rating: "desc" }, { createdAt: "desc" }],
    // No `take` here: the winner for a given product could sit anywhere in the
    // ordering, so capping the query would silently drop products. The set is
    // bounded by the filters above and reduced to `take` after de-duping.
    select: {
      id: true,
      rating: true,
      title: true,
      comment: true,
      createdAt: true,
      imageUrl: true,
      user: { select: { name: true } },
      product: { select: { name: true, slug: true, images: true } },
    },
  });

  const seenProducts = new Set<string>();

  return (
    reviews
      // A one-word "nice" is fine on a product page but is not a testimonial.
      // 25 is deliberately low: it clears "nice"/"good"/"loved it" while still
      // admitting a genuine short review like "Exactly as pictured, great
      // finish" — the bar is "says something", not "is long".
      .filter((r) => (r.comment ?? "").trim().length >= MIN_COMMENT_LENGTH)
      // At most one review per product, so the section shows a spread of the
      // catalogue rather than three raves about the same ring.
      .filter((r) => {
        if (seenProducts.has(r.product.slug)) return false;
        seenProducts.add(r.product.slug);
        return true;
      })
      .slice(0, take)
      .map((r) => ({
        id: r.id,
        rating: r.rating,
        title: r.title,
        comment: r.comment!,
        // Surname withheld — reviewers didn't agree to be named in full on the
        // homepage. "Divya R." is the convention the review list already uses.
        authorName: shortenName(r.user.name),
        createdAt: r.createdAt,
        // Only the first. A homepage card has room for one thumbnail, and the
        // rest of their photos are on the product page where they belong.
        customerImage: r.imageUrl,
        product: {
          name: r.product.name,
          slug: r.product.slug,
          image: r.product.images[0] ?? null,
        },
      }))
  );
}

/** "Divya Ramesh" → "Divya R." ; a single name is left as-is. */
function shortenName(name: string | null): string {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return "Verified customer";
  const [first, ...rest] = trimmed.split(/\s+/);
  return rest.length > 0 ? `${first} ${rest[rest.length - 1][0].toUpperCase()}.` : first;
}
