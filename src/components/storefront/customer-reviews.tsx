import Link from "next/link";
import Image from "next/image";
import { Star, BadgeCheck } from "lucide-react";
import { getTopReviews, type TopReview } from "@/server/reviews/top-reviews";
import { RevealSection } from "@/components/storefront/reveal-section";

/**
 * The card's thumbnail — the reviewer's own photo when they attached one,
 * otherwise the catalogue shot.
 *
 * A shopper who has scrolled this far has already seen our photography. A phone
 * picture of the piece as it actually arrived is the one image on the card they
 * have not seen and that cannot be styled, which is precisely what makes it
 * worth more here than a studio image. The product name sits beside it either
 * way, so the review stays checkable whichever picture is used.
 */
function ReviewThumbnail({ review }: { review: TopReview }) {
  const src = review.customerImage ?? review.product.image;

  return (
    <div className="relative size-11 shrink-0 overflow-hidden rounded-sm bg-muted">
      {src && (
        <Image
          src={src}
          // Decorative: the whole card is a single link and the text beside this
          // already names the piece, so describing the photo here would only
          // lengthen the link's spoken name.
          alt=""
          fill
          loading="lazy"
          sizes="44px"
          className="object-cover"
        />
      )}
    </div>
  );
}

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
    <RevealSection className="container-page rhythm-commerce">
      <div className="mb-10 text-center">
        <p className="label-eyebrow mb-2">In their words</p>
        <h2 className="text-h2">What our customers say</h2>
        {/* Stated once here rather than badged on every card — every review in
            the system now comes from a delivered order, so a per-card badge
            would mark 100% of them and signal nothing. */}
        {/**
         * ⚠️  The tick is INLINE, inside the sentence — not a flex sibling of
         * it. This was `flex items-center justify-center gap-1.5`, which looks
         * correct on a desktop and breaks on a phone.
         *
         * The reason it breaks is worth knowing, because the markup gives no
         * hint of it. A bare text node inside a flex container becomes an
         * anonymous flex item. While the sentence fits on one line the icon and
         * the text centre together and all is well. As soon as it is too narrow
         * — which is every phone — the text wraps, the pair grows to the full
         * width of the row, and `justify-center` then has nothing left to
         * centre. The tick ends up marooned against the left edge, vertically
         * centred beside a three-line paragraph it no longer appears to belong
         * to.
         *
         * As an inline element it simply flows with the words, so it stays
         * attached to "Every" at any width. `align-[-0.2em]` sits it on the
         * text's optical centre; `align-middle` rides slightly high.
         *
         * max-w-md matches the preview stand-in in customer-reviews-note.tsx
         * and keeps the measure readable on a wide screen.
         */}
        <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">
          <BadgeCheck className="mr-1.5 inline size-4 align-[-0.2em] text-black" aria-hidden />
          Every review is from a verified buyer. Tap one to see the piece.
        </p>
      </div>

      <ul className="grid gap-x-10 gap-y-0 sm:grid-cols-2 lg:grid-cols-3">
        {reviews.map((review) => (
          <li key={review.id}>
            <Link
              href={`/products/${review.product.slug}`}
              transitionTypes={["nav-forward"]}
              className="group flex h-full flex-col border-t pt-6 transition-colors hover:border-black"
            >
              <span className="flex gap-0.5" aria-label={`${review.rating} out of 5 stars`}>
                {Array.from({ length: 5 }, (_, i) => (
                  <Star
                    key={i}
                    className={`size-3.5 ${
                      i < review.rating ? "fill-black text-black" : "text-muted-foreground/30"
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
                  checkable rather than a floating quote. The picture beside it
                  may be the reviewer's own; see ReviewThumbnail. */}
              <div className="mt-4 flex items-center gap-3 border-t pt-4">
                <ReviewThumbnail review={review} />
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
