import Link from "next/link";
import { Star } from "lucide-react";
import { getProductReviews } from "@/server/products/reviews";
import { ReviewCard } from "@/components/storefront/reviews/review-card";

function Stars({ rating }: { rating: number }) {
  return (
    <span className="flex gap-0.5" aria-label={`${rating} out of 5 stars`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`h-4 w-4 ${
            i < Math.round(rating) ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"
          }`}
        />
      ))}
    </span>
  );
}

/**
 * Product-page reviews.
 *
 * ── A grid, and photos lead it ──────────────────────────────────────────────
 * This was a single stacked column with the "bought this piece?" note beside it
 * in a 360px rail. That put the shop's own copy level with the first review and
 * gave every review the same weight, which on a page whose job is to convince
 * someone wastes the one thing a shopper trusts more than our photography: a
 * picture of the piece taken by a stranger.
 *
 * So the reviews now run three across, photo-bearing ones first (ordered in
 * getProductReviews, not here — see the note there about `take`), and the note
 * moves beneath them where it reads as a footer rather than a column.
 *
 * Each card devotes roughly 28% of its height to the photo and the rest to the
 * words. See review-card.tsx for why that ratio is fixed rather than letting
 * the image size itself.
 */
export async function ReviewSection({
  productId,
  productSlug,
  isAuthed,
}: {
  productId: string;
  productSlug: string;
  isAuthed: boolean;
}) {
  const { reviews, averageRating, count } = await getProductReviews(productId);

  return (
    <section className="container-detail border-t rhythm-commerce">
      {/* Centred with every other section heading — see section-heading.tsx.
          The rating summary rides on the same centred row rather than sitting
          under the heading, so the two still read as one line. */}
      <div className="flex flex-wrap items-center justify-center gap-4">
        <h2 className="text-h2">Reviews</h2>
        {count > 0 && (
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            <Stars rating={averageRating} />
            {averageRating.toFixed(1)} · {count} review{count === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {reviews.length === 0 ? (
        <p className="mt-6 text-center text-sm text-muted-foreground">
          No reviews yet — be the first to review this piece.
        </p>
      ) : (
        // items-stretch (the grid default) plus h-full on the card is what keeps
        // a row level: without it a card with a short quote would sit shorter
        // than the photo-bearing one beside it and the row would look broken.
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {reviews.map((review) => (
            <ReviewCard
              key={review.id}
              review={{
                id: review.id,
                rating: review.rating,
                title: review.title,
                comment: review.comment,
                imageUrl: review.imageUrl,
                authorName: review.user.name ?? "Customer",
                isVerifiedPurchase: review.isVerifiedPurchase,
                // Serialised here because ReviewCard is a client component and a
                // Date cannot cross that boundary.
                createdAt: review.createdAt.toISOString(),
              }}
            />
          ))}
        </div>
      )}

      {/* Reviewing lives in the order history, where proof of purchase is — the
          same place Amazon and Flipkart put it. A form here would invite people
          who never bought the piece to fill it in and then be refused on submit.

          Beneath the grid rather than in a rail beside it: as a column it sat
          level with the first review and competed with it, and it is the least
          important thing in this section. */}
      <div className="mt-8 border-t pt-5 text-sm text-muted-foreground">
        {isAuthed ? (
          <p>
            <span className="font-medium text-foreground">Bought this piece?</span> Reviews come
            from delivered orders — find it under{" "}
            <Link href="/account/orders" className="underline underline-offset-4">
              your orders
            </Link>{" "}
            to write one, and add a photo if you have one. Every review is read by our team before
            it appears.
          </p>
        ) : (
          <p>
            <Link
              href={`/login?redirect=/products/${productSlug}`}
              className="underline underline-offset-4"
            >
              Sign in
            </Link>{" "}
            to review a piece you&apos;ve bought.
          </p>
        )}
      </div>
    </section>
  );
}
