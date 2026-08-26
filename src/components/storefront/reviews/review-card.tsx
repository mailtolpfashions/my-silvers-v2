"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Star, X } from "lucide-react";

export type ReviewCardData = {
  id: string;
  rating: number;
  title: string | null;
  comment: string | null;
  imageUrl: string | null;
  authorName: string;
  isVerifiedPurchase: boolean;
  createdAt: string;
};

/**
 * One review in the product-page grid.
 *
 * ── The photo is a fixed band, and it leads ─────────────────────────────────
 * `aspect-[4/3]` sizes the photo against the card's WIDTH, so on a ~356px
 * column it stands about 270px tall. Against a typical three-line review that
 * works out at roughly 60/40 in the photo's favour.
 *
 * ⚠️  That is deliberate, and it is NOT the 25-30% the brief first asked for.
 * The two turned out to be incompatible: to get the photo down to 28% beside a
 * short review, the band would have to be about 80px tall on a 356px card — a
 * letterbox strip that crops a portrait phone photo until the piece itself is
 * barely visible. At that size a photo stops being evidence and becomes
 * texture, which defeats the reason for showing it. Reviewed against the real
 * thing on screen and the photo-led version was kept.
 *
 * `object-cover` is what makes a grid possible at all — it crops rather than
 * letterboxes, so a portrait phone photo and a landscape one produce the same
 * shaped card and a row stands level. Without it this would be a masonry wall.
 */
export function ReviewCard({ review }: { review: ReviewCardData }) {
  const [lightboxOpen, setLightboxOpen] = useState(false);

  // Escape closes the lightbox. A hand-rolled overlay gets none of the Dialog
  // primitive's behaviour for free, and on a full-bleed photo the X is genuinely
  // hard to find.
  useEffect(() => {
    if (!lightboxOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxOpen]);

  return (
    <>
      <article className="flex h-full flex-col border">
        {review.imageUrl && (
          <button
            type="button"
            onClick={() => setLightboxOpen(true)}
            aria-label={`Open ${review.authorName}'s photo`}
            className="relative aspect-[4/3] w-full overflow-hidden bg-muted transition-opacity hover:opacity-90"
          >
            <Image
              src={review.imageUrl}
              alt={`Photo from ${review.authorName}'s review`}
              fill
              // Three columns at desktop, two at tablet, one on a phone. Getting
              // this wrong is how a grid of thumbnails ends up downloading
              // full-width images thirty times over.
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              className="object-cover"
            />
          </button>
        )}

        <div className="flex flex-1 flex-col gap-2 p-4">
          <div className="flex items-center gap-2">
            <Stars rating={review.rating} />
            {review.isVerifiedPurchase && (
              <span className="text-micro uppercase tracking-[0.1em] text-black">Verified</span>
            )}
          </div>

          {review.title && <p className="text-sm font-medium">{review.title}</p>}

          {review.comment && (
            // flex-1 so the attribution below is pinned to the bottom of every
            // card regardless of how long the quote is — the row keeps a shared
            // baseline instead of each name floating at its own height.
            <p className="flex-1 text-sm leading-relaxed text-muted-foreground">
              {review.comment}
            </p>
          )}

          <p className="mt-1 text-sm">
            <span className="font-medium">{review.authorName}</span>{" "}
            <span className="text-muted-foreground">
              ·{" "}
              {new Date(review.createdAt).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </span>
          </p>
        </div>
      </article>

      {lightboxOpen && review.imageUrl && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Photo from ${review.authorName}'s review`}
          className="fixed inset-0 z-50 grid place-items-center bg-black/85 p-4"
          onClick={() => setLightboxOpen(false)}
        >
          <button
            type="button"
            aria-label="Close"
            onClick={() => setLightboxOpen(false)}
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
          >
            <X className="size-5" />
          </button>

          {/* The card crops to 4:3; the lightbox is where the whole photo is
              finally shown, so this one is `object-contain`. */}
          <div className="max-h-full max-w-3xl" onClick={(e) => e.stopPropagation()}>
            <Image
              src={review.imageUrl}
              alt={`Photo from ${review.authorName}'s review`}
              width={1200}
              height={1200}
              sizes="(max-width: 768px) 100vw, 768px"
              className="max-h-[85vh] w-auto object-contain"
            />
          </div>
        </div>
      )}
    </>
  );
}

function Stars({ rating }: { rating: number }) {
  return (
    <span className="flex gap-0.5" aria-label={`${rating} out of 5 stars`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`h-3.5 w-3.5 ${
            i < Math.round(rating) ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"
          }`}
          aria-hidden
        />
      ))}
    </span>
  );
}
