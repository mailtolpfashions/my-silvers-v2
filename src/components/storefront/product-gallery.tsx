"use client";

import { useId, useState } from "react";
import Image from "next/image";
import { ProductImageZoom } from "@/components/storefront/product-image-zoom";
import { GalleryRail } from "@/components/storefront/gallery-rail";

/**
 * The product gallery.
 *
 * ── Two compositions, ONE DOM tree ───────────────────────────────────────────
 * DESKTOP stacks every image at full column width, one under the other, and
 * lets the detail column beside it stick. That is the luxury pattern, and it
 * fixes a real bug at the same time: the gallery used to be `sm:sticky` while
 * also being the TALLER of the two columns on every product in the catalogue,
 * so there was never any overhang to stick against and the stickiness never
 * engaged. The columns are now the right way round.
 *
 * MOBILE shows one swipeable frame with dot indicators. Stacking six full-width
 * images on a phone would be six screens of scrolling before the price.
 *
 * Both come from the SAME list, with visibility decided per frame, rather than
 * from two branches behind `lg:hidden` / `hidden lg:flex`. That is not a
 * simplification — it is required. `display: none` still MOUNTS a component,
 * so two branches meant two live <ViewTransition name="product-{id}"> elements
 * at once, and React warns: "There are two ViewTransition components with the
 * same name mounted at the same time." A duplicate name makes the browser
 * abandon the card → page morph for the whole document. Frame 0 must exist
 * exactly once in the tree.
 *
 * ── The thumbnail rail ───────────────────────────────────────────────────────
 * A persistent thumbnail strip was removed here once, because it made the
 * photography secondary: you looked at a small picture and clicked to see a
 * bigger one, which is backwards for a design that rests on the photographs
 * being the loudest thing on the page.
 *
 * What is here now is not that. It is hidden until the pointer is over the
 * gallery, so at rest the page is still nothing but photography, and it does
 * not swap a main image — it scrolls to one. Desktop only. See gallery-rail.tsx
 * for why that is the only job the control can do against a stacked gallery.
 */
export function ProductGallery({
  images,
  alt,
  videoUrl,
  /** Rendered as frame 0 so the card → page morph has a target. */
  morphSlot,
}: {
  images: string[];
  alt: string;
  /**
   * Optional product video, shown after the images.
   *
   * The field has existed on Product and been uploadable in /admin all along,
   * but nothing on the storefront rendered it — every video an admin uploaded
   * was invisible to shoppers.
   */
  videoUrl?: string | null;
  morphSlot?: React.ReactNode;
}) {
  const [active, setActive] = useState(0);
  // Stable across renders and unique per gallery instance, so the rail can find
  // its frames by id without either of them owning a ref list.
  const galleryId = useId();
  const frameIds = images.map((_, i) => `${galleryId}-frame-${i}`);

  // Handed to ProductImageZoom rather than wrapped around it: that component
  // already owns the swipe/click interaction and needs to know a swipe
  // happened, so the gesture doesn't also open the lightbox.
  //
  // Wrapping rather than stopping at the ends: hitting a wall and having
  // nothing happen reads as the gallery being broken.
  const many = images.length > 1;
  const onPrev = many ? () => setActive((i) => (i - 1 + images.length) % images.length) : undefined;
  const onNext = many ? () => setActive((i) => (i + 1) % images.length) : undefined;

  if (images.length === 0 && !videoUrl) {
    return (
      <div className="flex aspect-[4/5] items-center justify-center bg-muted text-sm text-muted-foreground">
        No image available
      </div>
    );
  }

  return (
    <div>
      {/* gap-2 on desktop rather than a flush stack: at full column width two
          touching photographs read as one very tall picture.

          `group/gallery` is the hover scope the rail fades in from. Named
          rather than bare, because each frame inside is already a `group` of
          its own for the zoom affordance, and an unnamed one here would be the
          nearer ancestor for those. */}
      <div className="group/gallery relative flex flex-col lg:gap-2">
        {images.map((src, i) => (
          <div
            key={src}
            id={frameIds[i]}
            // The whole responsive behaviour, in one line: on a phone only the
            // active frame is laid out; from lg every frame is.
            className={i === active ? "block" : "hidden lg:block"}
          >
            <ProductImageZoom src={src} alt={alt} onPrev={onPrev} onNext={onNext}>
              {/* Frame 0 comes from the server so it can carry the shared
                  view-transition name and the preload hint. */}
              {i === 0 && morphSlot ? (
                morphSlot
              ) : (
                <Image
                  src={src}
                  alt={i === 0 ? alt : ""}
                  fill
                  loading={i === 0 ? undefined : "lazy"}
                  sizes="(max-width: 1024px) 100vw, 55vw"
                  className="object-cover"
                />
              )}
            </ProductImageZoom>
          </div>
        ))}

        {videoUrl && (
          <div className="relative aspect-[4/5] overflow-hidden bg-muted">
            <ProductVideo videoUrl={videoUrl} poster={images[0]} />
          </div>
        )}

        {/* Last in the DOM so it paints over the photographs, and INSIDE the
            hover group so moving onto the rail itself does not dismiss it. It
            is sticky with zero height, so it costs the column no layout — see
            the note in gallery-rail.tsx. */}
        <GalleryRail images={images} alt={alt} frameIds={frameIds} />
      </div>

      {/* Dots are a phone affordance only — on desktop every frame is already
          on screen, so an indicator would point at nothing. */}
      {many && (
        <div className="mt-4 flex justify-center gap-2 lg:hidden" role="tablist" aria-label="Product images">
          {images.map((src, i) => (
            <button
              key={src}
              type="button"
              role="tab"
              aria-selected={i === active}
              aria-label={`Image ${i + 1} of ${images.length}`}
              onClick={() => setActive(i)}
              // 28×40 hit area around a 6px dot: over the 24px WCAG 2.5.8 floor
              // without spreading them so far apart they stop reading as one
              // control.
              className="flex h-10 w-7 items-center justify-center"
            >
              <span
                className={`block h-1.5 transition-all duration-300 ${
                  i === active ? "w-6 bg-black" : "w-1.5 bg-black/25"
                }`}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * `preload="none"` and no autoplay: the video only downloads when a shopper
 * asks for it, so the page weight is unchanged for everyone else and the LCP
 * image is untouched. The poster reuses the first image so the frame is never
 * blank.
 *
 * Not wrapped in ProductImageZoom — magnifying a <video> would fight its own
 * controls, and a lightbox of a paused frame helps nobody.
 */
function ProductVideo({ videoUrl, poster }: { videoUrl: string; poster?: string }) {
  return (
    <video
      src={videoUrl}
      controls
      playsInline
      preload="none"
      poster={poster}
      aria-label="Product video"
      className="absolute inset-0 h-full w-full bg-black object-cover"
    />
  );
}
