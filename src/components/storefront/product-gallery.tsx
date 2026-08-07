"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { Play } from "lucide-react";
import { ProductImageZoom } from "@/components/storefront/product-image-zoom";
import { gsap, useGSAP, ScrollTrigger, MOTION_QUERY } from "@/lib/gsap";

/** Matches the gallery's own `sm:top-24`. Keep the two in step. */
const STICKY_TOP_PX = 96;

/**
 * Shortest stuck distance worth running the angle sequence over. Roughly 130px
 * per angle on a three-image product — enough for each to be seen rather than
 * flicked past.
 */
const MIN_TRAVEL_PX = 400;

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
  const scope = useRef<HTMLDivElement>(null);
  /**
   * Set the moment a shopper picks a thumbnail themselves, and never unset.
   *
   * The scroll-linked sequence below is a flourish; a deliberate choice is an
   * instruction. Without this the two fight — you tap the third angle, scroll
   * one line to read the specs, and the page silently puts you back on the
   * first.
   */
  const userPicked = useRef(false);

  // The video occupies one slot past the last image.
  const videoIndex = videoUrl ? images.length : -1;
  const slideCount = images.length + (videoUrl ? 1 : 0);
  const showingVideo = active === videoIndex;

  /**
   * Advances through the angles as the page scrolls past the stuck gallery.
   *
   * The trigger is the parent grid rather than this element: the gallery is
   * `position: sticky`, so its own bounding box stops moving relative to the
   * viewport and would give ScrollTrigger a range of almost nothing to work
   * with. The grid is the element that actually travels, and its height is the
   * length of the specification column beside us — which is exactly the
   * distance we want the sequence spread across.
   *
   * Honest about what this is: with two to five angles it is a slow cross-fade
   * between real photographs, not the hundred-frame render sequence Apple uses.
   * It reads as the piece turning as you read about it.
   *
   * The range is measured, not expressed as "top top" to "bottom bottom". That
   * pairing looks reasonable and is a trap: on a product whose detail column is
   * shorter than the viewport it resolves the END BEFORE THE START, ScrollTrigger
   * collapses the inverted range to zero length, and the first scroll snaps
   * progress straight to 1 — the gallery jumping to the last image. Which is
   * precisely what it did.
   *
   * So the distance is the one that actually exists: how far the page scrolls
   * while the gallery is stuck, which is the detail column's overhang past it.
   * Below MIN_TRAVEL there is no sequence worth having and none is created —
   * cycling three photographs across 80px is a flicker, not a reveal.
   */
  useGSAP(
    () => {
      if (images.length < 2) return;
      const grid = scope.current?.parentElement;
      if (!grid) return;

      const mm = gsap.matchMedia();

      mm.add(MOTION_QUERY.desktop, () => {
        /** Scroll distance the gallery stays stuck for. */
        const travel = () =>
          grid.offsetHeight - (scope.current?.offsetHeight ?? 0) - STICKY_TOP_PX;

        // Checked once, at creation. A column that grows later — reviews
        // arriving — will not retroactively gain the sequence, which is the
        // right way round to be wrong: no effect, never a jump.
        if (travel() < MIN_TRAVEL_PX) return;

        const trigger = ScrollTrigger.create({
          trigger: grid,
          // Where the gallery actually becomes stuck, matching sm:top-24.
          start: `top top+=${STICKY_TOP_PX}`,
          // A function plus invalidateOnRefresh, because the detail column's
          // height is not final at creation: reviews and recommendations stream
          // in under Cache Components and change it.
          end: () => `+=${travel()}`,
          invalidateOnRefresh: true,
          onUpdate: (self) => {
            if (userPicked.current) {
              trigger.kill();
              return;
            }
            // Clamped rather than wrapped: the last angle should hold at the
            // bottom of the range, not snap back to the first.
            const index = Math.min(
              images.length - 1,
              Math.floor(self.progress * images.length),
            );
            setActive((current) => (current === index ? current : index));
          },
        });

        return () => trigger.kill();
      });

      return () => mm.revert();
    },
    { scope, dependencies: [images.length] },
  );

  function pick(index: number) {
    userPicked.current = true;
    setActive(index);
  }

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
    // past it. This is the single most "considered" thing a product page can
    // do, and it is CSS — a scroll library would only be reimplementing
    // position: sticky with a worse understanding of the layout.
    //
    // top-24 clears the sticky site header. `self-start` because the parent
    // grid must not stretch this column; see the note there.
    <div ref={scope} className="flex flex-col gap-3 sm:sticky sm:top-24 sm:self-start">
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
              ? () => pick((active - 1 + images.length) % images.length)
              : undefined
          }
          onNext={
            images.length > 1 ? () => pick((active + 1) % images.length) : undefined
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
                onClick={() => pick(i)}
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
                onClick={() => pick(videoIndex)}
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
