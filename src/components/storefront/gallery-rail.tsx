"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";

/**
 * The thumbnail rail over the product gallery — hidden until the pointer is
 * over the gallery, then a column of 56px frames down the lower-left corner.
 *
 * ── What it is, and what it deliberately is NOT ──────────────────────────────
 * On this storefront the desktop gallery shows every photograph at once, one
 * under the other at full column width. So this rail does not SELECT an image
 * the way the reference's does — there is no single main frame to swap. It
 * scrolls: clicking a thumbnail takes you to that photograph, and the rail
 * marks which one currently fills the viewport.
 *
 * That is the same control doing the only job left for it to do here. A picker
 * would mean collapsing the gallery to one frame, which would make it the
 * SHORTER of the two columns and break the sticky detail rail beside it — see
 * the note at the top of product-gallery.tsx, which exists because that was
 * once a real bug.
 *
 * ── Hover, and why that is safe ──────────────────────────────────────────────
 * Revealed by `group-hover` on the gallery wrapper, so it costs no JavaScript
 * and cannot flash on first paint. Below lg it renders nothing at all: there is
 * no hover on a phone, the gallery there is a single swipeable frame, and the
 * dots underneath it already say where you are.
 *
 * Keyboard users are not left out — `focus-within` reveals it too, so tabbing
 * into the rail brings it up.
 */
export function GalleryRail({
  images,
  alt,
  /** Element ids of the gallery frames, in order. Index-aligned with `images`. */
  frameIds,
}: {
  images: string[];
  alt: string;
  frameIds: string[];
}) {
  const [current, setCurrent] = useState(0);
  const railRef = useRef<HTMLDivElement | null>(null);

  /**
   * Which photograph is being looked at.
   *
   * An IntersectionObserver rather than a scroll handler: the frames are a
   * viewport tall each, so this fires a handful of times per page rather than
   * on every scroll frame, and it needs no measurement of its own.
   *
   * The rootMargin pulls the detection band to the middle of the viewport, so
   * the marked thumbnail is the frame under the shopper's eye rather than
   * whichever one has just clipped the bottom edge.
   */
  useEffect(() => {
    const frames = frameIds
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    if (frames.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const index = frames.indexOf(entry.target as HTMLElement);
          if (index >= 0) setCurrent(index);
        }
      },
      { rootMargin: "-45% 0px -45% 0px", threshold: 0 }
    );

    for (const frame of frames) observer.observe(frame);
    return () => observer.disconnect();
  }, [frameIds]);

  // One photograph needs no rail; the control would say nothing.
  if (images.length < 2) return null;

  return (
    <div
      ref={railRef}
      // `sticky` inside the gallery column, pinned near the foot of the
      // viewport: the gallery is many screens tall, so a rail positioned
      // against the gallery itself would scroll away with the first image.
      // -mt-* pulls the following content back up over the space it would
      // otherwise occupy, so the rail costs the column no height.
      className="pointer-events-none sticky bottom-6 z-10 hidden h-0 pl-4 lg:block"
      aria-label="Product images"
    >
      <div
        className="pointer-events-auto flex w-14 -translate-y-full flex-col gap-2 opacity-0 transition-opacity duration-300 group-hover/gallery:opacity-100 focus-within:opacity-100 motion-reduce:transition-none"
      >
        {images.map((src, i) => (
          <button
            key={src}
            type="button"
            aria-label={`Go to image ${i + 1} of ${images.length}`}
            aria-current={i === current}
            onClick={() => {
              document
                .getElementById(frameIds[i])
                ?.scrollIntoView({ behavior: "smooth", block: "center" });
            }}
            // The current frame is marked by a solid rule down the left edge
            // and full opacity; the rest sit back. No border box and no radius,
            // matching every other frame on this storefront.
            className={`relative aspect-square w-14 overflow-hidden bg-muted transition-opacity duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
              i === current ? "opacity-100" : "opacity-55 hover:opacity-100"
            }`}
          >
            <Image
              src={src}
              alt={`${alt} — image ${i + 1}`}
              fill
              // 56px on a 2× screen. The rail never grows, so this is exact.
              sizes="56px"
              className="object-cover"
            />
            <span
              aria-hidden
              className={`absolute inset-y-0 left-0 w-0.5 bg-black transition-opacity duration-200 ${
                i === current ? "opacity-100" : "opacity-0"
              }`}
            />
          </button>
        ))}
      </div>
    </div>
  );
}
