import Link from "next/link";
import { Star } from "lucide-react";
import { getProductReviews } from "@/server/products/reviews";
import { Badge } from "@/components/ui/badge";
import { ReviewForm } from "@/components/storefront/reviews/review-form";

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
    <section className="mx-auto max-w-6xl border-t px-4 py-12">
      <div className="flex flex-wrap items-center gap-4">
        <h2 className="text-xl font-semibold">Reviews</h2>
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
                    <Badge variant="secondary" className="text-[10px]">
                      Verified purchase
                    </Badge>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {review.createdAt.toLocaleDateString("en-IN", { dateStyle: "medium" })}
                  </span>
                </div>
                {review.title && <p className="mt-2 text-sm font-medium">{review.title}</p>}
                {review.comment && (
                  <p className="mt-1 text-sm text-muted-foreground">{review.comment}</p>
                )}
              </div>
            ))
          )}
        </div>

        <div>
          {isAuthed ? (
            <ReviewForm productId={productId} productSlug={productSlug} />
          ) : (
            <p className="rounded-lg border p-4 text-sm text-muted-foreground">
              <Link href={`/login?redirect=/products/${productSlug}`} className="underline">
                Sign in
              </Link>{" "}
              to leave a review.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
