import Link from "next/link";
import Image from "next/image";
import { Star, BadgeCheck } from "lucide-react";
import { getTopReviews } from "@/server/reviews/top-reviews";
import { RevealSection } from "@/components/storefront/reveal-section";

/**
 * Homepage social proof, drawn from real reviews rather than CMS copy.
 *
 * Every card is a whole clickable link to the product being reviewed — the
 * point is that a shopper can check the claim, see the rest of that product's
 * reviews, and buy the thing that earned the praise.
 *
 * Renders nothing when there are no qualifying reviews. An empty "What our
 * customers say" heading is worse than no section, and a new shop legitimately
 * has none yet.
 */
export async function CustomerReviews() {
  const reviews = await getTopReviews(6);
  if (reviews.length === 0) return null;

  return (
    <RevealSection className="container-page py-10 sm:py-16">
      <div className="mb-10 text-center">
        <p className="label-eyebrow mb-2">In their words</p>
        <h2 className="text-h2">What our customers say</h2>
        {/* Stated once here rather than badged on every card — every review in
            the system now comes from a delivered order, so a per-card badge
            would mark 100% of them and signal nothing. */}
        <p className="mt-3 flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
          <BadgeCheck className="size-4 text-brass-text" aria-hidden />
          Every review is from a verified buyer. Tap one to see the piece.
        </p>
      </div>

      <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {reviews.map((review) => (
          <li key={review.id}>
            <Link
              href={`/products/${review.product.slug}`}
              transitionTypes={["nav-forward"]}
              className="group flex h-full flex-col rounded-md border bg-card p-6 transition-colors hover:border-brass"
            >
              <span className="flex gap-0.5" aria-label={`${review.rating} out of 5 stars`}>
                {Array.from({ length: 5 }, (_, i) => (
                  <Star
                    key={i}
                    className={`size-3.5 ${
                      i < review.rating ? "fill-brass text-brass" : "text-muted-foreground/30"
                    }`}
                    aria-hidden
                  />
                ))}
              </span>

              {review.title && (
                <p className="mt-3 font-heading text-base text-foreground">{review.title}</p>
              )}

              <blockquote className="mt-2 line-clamp-4 flex-1 text-sm leading-relaxed text-muted-foreground">
                {review.comment}
              </blockquote>

              <p className="mt-4 text-sm font-medium text-foreground">{review.authorName}</p>

              {/* The product is the proof — naming it is what makes the review
                  checkable rather than a floating quote. */}
              <div className="mt-4 flex items-center gap-3 border-t pt-4">
                <div className="relative size-11 shrink-0 overflow-hidden rounded-sm bg-muted">
                  {review.product.image && (
                    <Image
                      src={review.product.image}
                      alt=""
                      fill
                      loading="lazy"
                      sizes="44px"
                      className="object-cover"
                    />
                  )}
                </div>
                <span className="line-clamp-2 text-xs text-muted-foreground transition-colors group-hover:text-foreground">
                  on {review.product.name}
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </RevealSection>
  );
}
