import Link from "next/link";
import { Star } from "lucide-react";
import { getProductReviews } from "@/server/products/reviews";
import { ReviewMedia } from "@/components/storefront/reviews/review-media";

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

      <div className="mt-6 grid gap-10 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          {reviews.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No reviews yet — be the first to review this piece.
            </p>
          ) : (
            reviews.map((review) => (
              <div key={review.id} className="border-b pb-5 last:border-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Stars rating={review.rating} />
                  <span className="text-sm font-medium">{review.user.name ?? "Customer"}</span>
                  {review.isVerifiedPurchase && (
                    <span className="text-micro uppercase tracking-[0.1em] text-black">Verified purchase</span>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {review.createdAt.toLocaleDateString("en-IN", { dateStyle: "medium" })}
                  </span>
                </div>
                {review.title && <p className="mt-2 text-sm font-medium">{review.title}</p>}
                {review.comment && (
                  <p className="mt-1 text-sm text-muted-foreground">{review.comment}</p>
                )}
                <ReviewMedia
                  imageUrls={review.imageUrls}
                  videoUrl={review.videoUrl}
                  authorName={review.user.name ?? "Customer"}
                />
              </div>
            ))
          )}
        </div>

        <div>
          {/* Reviewing moved to the order history, where proof of purchase
              lives — the same place Amazon and Flipkart put it. A form here
              would invite people who never bought the piece to fill it in and
              then be refused on submit. */}
          {isAuthed ? (
            <div className="border-t bg-muted/30 p-4 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">Bought this piece?</p>
              <p className="mt-1.5">
                Reviews come from delivered orders. Find it under{" "}
                <Link href="/account/orders" className="underline underline-offset-4">
                  your orders
                </Link>{" "}
                to write one — including photos and a short video, if you like.
              </p>
              {/* Set here rather than only in the confirmation toast: someone
                  deciding whether to bother writing one should know it will not
                  appear the instant they press post. */}
              <p className="mt-1.5">Every review is read by our team before it appears.</p>
            </div>
          ) : (
            <p className="border-t p-4 text-sm text-muted-foreground">
              <Link href={`/login?redirect=/products/${productSlug}`} className="underline">
                Sign in
              </Link>{" "}
              to review a piece you&apos;ve bought.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
