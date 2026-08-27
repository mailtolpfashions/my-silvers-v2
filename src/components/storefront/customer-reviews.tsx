import { BadgeCheck } from "lucide-react";
import { getTopReviews } from "@/server/reviews/top-reviews";
import { RevealSection } from "@/components/storefront/reveal-section";
import {
  ReviewCarousel,
  type CarouselReview,
} from "@/components/storefront/reviews/review-carousel";

/**
 * Homepage social proof, drawn from real reviews rather than CMS copy.
 *
 * Every plate is a whole clickable link to the product being reviewed — the
 * point is that a shopper can check the claim, see the rest of that product's
 * reviews, and buy the thing that earned the praise.
 *
 * Renders nothing when there are no qualifying reviews. An empty "What our
 * customers say" heading is worse than no section, and a new shop legitimately
 * has none yet.
 *
 * ── Why this is a fan and not a grid ────────────────────────────────────────
 * It was three columns of quote cards with a 44px thumbnail apiece. That laid
 * six reviews out flat and gave the photograph — the only thing on the card a
 * shopper trusts more than our own copy — less room than the word "on".
 *
 * The carousel inverts it: one photograph large and centred, the rest fanned
 * behind it, and the words in a panel beneath where they get a full measure to
 * be read at. Fewer reviews on screen at once, which is the trade; the
 * homepage is the right page to make it on, because nobody arrives there to
 * audit six testimonials. The product page keeps its grid for exactly that
 * reason — see reviews/review-section.tsx.
 *
 * The fan itself lives in ReviewCarousel, which is a client component. This
 * stays a server component and hands it plain data: the query, the photo
 * fallback and the ordering are all decided here, where they are cacheable.
 */
export async function CustomerReviews() {
  const reviews = await getTopReviews(6);
  if (reviews.length === 0) return null;

  const plates: CarouselReview[] = reviews
    .map((review) => ({
      id: review.id,
      rating: review.rating,
      title: review.title,
      comment: review.comment,
      authorName: review.authorName,
      // The reviewer's own photo when they attached one, else the catalogue
      // shot. A carousel cannot skip a review for want of a picture the way a
      // grid card could shrink around one — a hole in the fan is a hole in the
      // arc — so there is always an image and the plate caption says which
      // kind it is.
      image: review.customerImage ?? review.product.image,
      isCustomerPhoto: review.customerImage !== null,
      product: { name: review.product.name, slug: review.product.slug },
    }))
    // Customer photos first, so the plate holding centre on arrival is the one
    // a shopper has not seen before. Only the FIRST position really matters —
    // the fan cycles through all six either way — but it is the position that
    // does the most work. `getTopReviews` orders by rating and cannot do this:
    // it does not know one of the two images will be chosen over the other.
    .sort((a, b) => Number(b.isCustomerPhoto) - Number(a.isCustomerPhoto));

  return (
    <RevealSection className="container-page rhythm-commerce">
      <div className="mb-10 text-center">
        <p className="label-eyebrow mb-2">In their words</p>
        <h2 className="text-h2">What our customers say</h2>
        {/* Stated once here rather than badged on every plate — every review in
            the system now comes from a delivered order, so a per-plate badge
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
          <BadgeCheck
            className="mr-1.5 inline size-4 align-[-0.2em] text-black"
            aria-hidden
          />
          Every review is from a verified buyer. Tap one to see the piece.
        </p>
      </div>

      <ReviewCarousel reviews={plates} />
    </RevealSection>
  );
}
