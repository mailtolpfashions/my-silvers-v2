"use client";

import { useState } from "react";
import Image from "next/image";
import { Play } from "lucide-react";
import { ProductImageZoom } from "@/components/storefront/product-image-zoom";

/**
 * Product image gallery.
 *
 * The product page previously rendered `images[0]` and nothing else, so every
 * additional angle uploaded in /admin was invisible to shoppers. On a jewellery
 * site that is the difference between "a photo" and "a look at the piece".
 *
 * Client-side because selecting a thumbnail is local state, but the markup is
 * plain — no carousel library, and every image is a real <Image> so they all
 * benefit from the optimizer.
 */
export function ProductGallery({
  images,
  alt,
  videoUrl,
  /** Rendered as the first slide so the card → page morph has a target. */
  morphSlot,
}: {
  images: string[];
  alt: string;
  /**
   * Optional product video, shown as the final thumbnail.
   *
   * The field has existed on Product and been uploadable in /admin all along,
   * but nothing on the storefront rendered it — every video an admin uploaded
   * was invisible to shoppers.
   */
  videoUrl?: string | null;
  morphSlot?: React.ReactNode;
}) {
  const [active, setActive] = useState(0);

  // The video occupies one slot past the last image.
  const videoIndex = videoUrl ? images.length : -1;
  const slideCount = images.length + (videoUrl ? 1 : 0);
  const showingVideo = active === videoIndex;

  if (slideCount === 0) {
    return (
      <div className="flex aspect-[4/5] items-center justify-center rounded-md bg-muted text-sm text-muted-foreground">
        No image available
      </div>
    );
  }

  return (
    // Sticky from sm up, where the two columns sit side by side: the
    // photography holds while the specifications, trust list and reviews scroll
    // past it. Pure CSS, and pure CSS is the whole appeal — it costs nothing
    // when it engages and nothing when it does not.
    //
    // On the current catalogue it mostly does not: the gallery is the taller of
    // the two columns on every product measured, so there is no overhang to
    // stick against. That is fine and deliberate — it starts working on its own
    // the day a product carries a long enough description, with no code change.
    // A scroll-linked angle sequence used to live here too and was removed: it
    // needed ~500px of overhang that this layout never has, and shrinking the
    // photography to manufacture that distance was the wrong trade.
    //
    // top-24 clears the sticky site header. `self-start` because the parent
    // grid must not stretch this column; see the note there.
    <div className="flex flex-col gap-3 sm:sticky sm:top-24 sm:self-start">
      {showingVideo ? (
        // Not wrapped in ProductImageZoom: magnifying a <video> would fight its
        // own controls, and a lightbox of a paused frame helps nobody.
        <div className="relative aspect-[4/5] overflow-hidden rounded-md bg-muted">
          {/* preload="none" and click-to-play: the video only downloads when a
              shopper asks for it, so the page weight is unchanged for everyone
              else and the LCP image is untouched. poster reuses the first image
              so the frame is never blank. */}
          <video
            src={videoUrl!}
            controls
            playsInline
            preload="none"
            poster={images[0]}
            className="absolute inset-0 h-full w-full bg-graphite-950 object-cover"
          />
        </div>
      ) : (
        <ProductImageZoom
          src={images[active]}
          alt={alt}
          // Cycles the IMAGES only, not slideCount — the video slide carries no
          // swipe handlers of its own (its controls own touch), so swiping into
          // it would strand the shopper there with no way back but a thumbnail.
          // The video stays reachable from its thumbnail.
          //
          // Wrapping rather than stopping at the ends: hitting a wall and having
          // nothing happen reads as the gallery being broken.
          onPrev={
            images.length > 1
              ? () => setActive((active - 1 + images.length) % images.length)
              : undefined
          }
          onNext={
            images.length > 1 ? () => setActive((active + 1) % images.length) : undefined
          }
        >
          {/* Slide 0 is handed in from the server so it can carry the shared
              view-transition name and the preload hint; the rest render here. */}
          {active === 0 && morphSlot ? (
            morphSlot
          ) : (
            <Image
              key={images[active]}
              src={images[active]}
              alt={alt}
              fill
              sizes="(max-width: 640px) 100vw, 45vw"
              className="object-cover"
            />
          )}
        </ProductImageZoom>
      )}

      {slideCount > 1 && (
        <ul className="grid grid-cols-5 gap-2" role="tablist" aria-label="Product media">
          {images.map((src, i) => (
            <li key={src}>
              <button
                type="button"
                role="tab"
                aria-selected={i === active}
                aria-label={`View image ${i + 1} of ${images.length}`}
                onClick={() => setActive(i)}
                className={`relative block aspect-square w-full overflow-hidden rounded-sm transition-opacity ${
                  i === active
                    ? "ring-2 ring-brass ring-offset-2 ring-offset-background"
                    : "opacity-70 hover:opacity-100"
                }`}
              >
                <Image
                  src={src}
                  alt=""
                  fill
                  loading="lazy"
                  sizes="80px"
                  className="object-cover"
                />
              </button>
            </li>
          ))}

          {videoUrl && (
            <li>
              <button
                type="button"
                role="tab"
                aria-selected={showingVideo}
                aria-label="Play product video"
                onClick={() => setActive(videoIndex)}
                className={`relative block aspect-square w-full overflow-hidden rounded-sm transition-opacity ${
                  showingVideo
                    ? "ring-2 ring-brass ring-offset-2 ring-offset-background"
                    : "opacity-70 hover:opacity-100"
                }`}
              >
                {/* The first image as the thumbnail, dimmed behind a play badge
                    — a video element here would defeat preload="none". */}
                {images[0] && (
                  <Image
                    src={images[0]}
                    alt=""
                    fill
                    loading="lazy"
                    sizes="80px"
                    className="object-cover"
                  />
                )}
                <span className="absolute inset-0 flex items-center justify-center bg-graphite-950/45">
                  <Play className="size-4 fill-white text-white" aria-hidden />
                </span>
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
