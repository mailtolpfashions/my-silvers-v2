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
    <div className="flex flex-col gap-3">
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
        <ProductImageZoom src={images[active]} alt={alt}>
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
