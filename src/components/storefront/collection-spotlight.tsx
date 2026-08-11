"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { usePointerPause } from "@/lib/use-pointer-pause";

type SpotlightItem = {
  id: string;
  slug: string;
  title: string;
  banner: string;
  products: Array<{ id: string; slug: string; name: string; image: string }>;
};

/**
 * How long a card holds before the rail advances on its own.
 *
 * Kept in step with the hero's own AUTOPLAY_MS — two carousels rotating at
 * different rates on one page read as one of them being broken.
 */
const AUTOPLAY_MS = 4000;

/** How long a pointer interaction holds the rail before it resumes. */
const POINTER_PAUSE_MS = 2000;

/**
 * How many copies of the list the track holds when looping.
 *
 * Three, and it has to be an odd number ≥ 3: the shopper always sits in the
 * MIDDLE copy, so there is a full copy of content either side to scroll into
 * before the position is silently normalised back. Two copies would leave one
 * side empty at the moment of the jump.
 */
const COPIES = 3;

/** useLayoutEffect warns during SSR; this component renders on both. */
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * A horizontal rail of collection cards — each a wide banner with three of that
 * collection's pieces overlapping its lower edge — with arrows, an endless
 * loop, and autoplay.
 *
 * Modelled on giva.co's "Latest Collections". The product thumbnails hanging
 * off the banner are the point of the block: every other collection surface on
 * this site shows the collection's artwork and makes you open it to find out
 * what is inside. This one answers that on the homepage.
 *
 * ── Native scrolling, not a slider library ───────────────────────────────────
 * The track is an ordinary overflow-x container with CSS scroll snapping. The
 * arrows call scrollBy() and the browser does the rest, so a trackpad swipe, a
 * touch drag, shift+wheel and the arrow buttons all drive the same mechanism
 * and stay in sync for free. A JS slider would have to reimplement all four and
 * would fight the momentum scrolling a phone already does well.
 *
 * ── The loop is real, and this is how ────────────────────────────────────────
 * The list is rendered three times and the shopper is placed in the middle
 * copy. Once scrolling settles, if the position has drifted into an outer copy
 * it is moved by exactly one copy's width with `behavior: instant` — the same
 * card is under the same pixel, so nothing is visible, but there is a fresh
 * copy of content ahead again.
 *
 * This replaced a wrap: previously `next` at the last card scrolled back to the
 * first, which worked but left the ends looking wrong — at the first card there
 * was nothing to its left and at the last nothing to its right, so the rail
 * showed white space where the half-card should be. A loop has no ends, so that
 * gap cannot occur.
 *
 * ⚠️  Normalising is DEBOUNCED, not done on every scroll event. Moving the
 * scroll position mid-animation cancels the browser's smooth scroll and the
 * arrows judder. Waiting for the scroll to settle is what keeps it invisible.
 *
 * The two outer copies are `aria-hidden` with untabbable links: they are the
 * same collections again, and a screen reader meeting each one three times, or
 * a keyboard user tabbing through twelve links to leave four cards, would be
 * the price of a purely visual trick.
 *
 * ── Centred, with half a card showing either side ────────────────────────────
 * A card is exactly 50% of the rail and snaps to centre, so the space beside a
 * centred card is (R−W)/2 = W/2 — half a card, on both sides, always.
 *
 * ── Autoplay ────────────────────────────────────────────────────────────────
 * Advances every 4s. It stops entirely under prefers-reduced-motion, while the
 * tab is hidden, and for as long as focus is inside the rail.
 *
 * A POINTER over it only pauses for two seconds and then resumes, rather than
 * holding indefinitely as it once did — a cursor left anywhere near the rail
 * used to stop it seeing a second card. Focus is treated differently on
 * purpose: a keyboard user working through the links cannot read against a
 * timer. See usePointerPause.
 */
export function CollectionSpotlight({ items }: { items: SpotlightItem[] }) {
  const trackRef = useRef<HTMLUListElement | null>(null);
  const settleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Focus inside the rail. Holds indefinitely — see the note above. */
  const [focusHeld, setFocusHeld] = useState(false);
  /** Pointer interaction: pauses for two seconds, then resumes on its own. */
  const { paused: pointerPaused, nudge } = usePointerPause(POINTER_PAUSE_MS);
  const [documentHidden, setDocumentHidden] = useState(false);
  const [motionAllowed, setMotionAllowed] = useState(false);

  // Looping needs something to loop through. One card is a static card.
  const looping = items.length > 1;
  const slides = looping ? Array.from({ length: COPIES }, () => items).flat() : items;

  /** Width of one copy of the list, i.e. the distance a normalise moves. */
  const cycle = useCallback(() => {
    const el = trackRef.current;
    return el ? el.scrollWidth / COPIES : 0;
  }, []);

  /** Put the shopper in the middle copy, centred on its first card. */
  const centreOnMiddle = useCallback(() => {
    const el = trackRef.current;
    if (!el || !looping) return;
    const first = el.children[items.length] as HTMLElement | undefined;
    if (!first) return;
    el.scrollTo({
      left: first.offsetLeft - (el.clientWidth - first.clientWidth) / 2,
      behavior: "instant",
    });
  }, [items.length, looping]);

  // Before paint, so the rail is never briefly shown sitting on copy 0.
  useIsoLayoutEffect(() => {
    centreOnMiddle();
  }, [centreOnMiddle]);

  // A resize changes every width the positions were derived from.
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => centreOnMiddle());
    observer.observe(el);
    return () => observer.disconnect();
  }, [centreOnMiddle]);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: no-preference)");
    const sync = () => setMotionAllowed(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const sync = () => setDocumentHidden(document.hidden);
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);

  /** Once scrolling has settled, fold an outer copy back to the middle one. */
  function handleScroll() {
    if (!looping) return;
    if (settleRef.current) clearTimeout(settleRef.current);
    settleRef.current = setTimeout(() => {
      const el = trackRef.current;
      if (!el) return;
      const c = cycle();
      if (c === 0) return;
      if (el.scrollLeft < c * 0.5) {
        el.scrollTo({ left: el.scrollLeft + c, behavior: "instant" });
      } else if (el.scrollLeft > c * 1.5) {
        el.scrollTo({ left: el.scrollLeft - c, behavior: "instant" });
      }
    }, 160);
  }

  /** One card plus its gap, measured so the step and the snap points agree. */
  const page = useCallback((direction: 1 | -1) => {
    const el = trackRef.current;
    if (!el) return;
    const first = el.firstElementChild as HTMLElement | null;
    const step = first ? first.getBoundingClientRect().width + 16 : el.clientWidth * 0.8;
    el.scrollBy({ left: step * direction, behavior: "smooth" });
  }, []);

  const autoplaying =
    looping && motionAllowed && !focusHeld && !pointerPaused && !documentHidden;

  useEffect(() => {
    if (!autoplaying) return;
    const timer = setInterval(() => page(1), AUTOPLAY_MS);
    return () => clearInterval(timer);
  }, [autoplaying, page]);

  if (items.length === 0) return null;

  return (
    // `fit-grow` marks this as the element the fitted section hands its
    // leftover height to — see globals.css. Harmless outside one.
    <div
      className="fit-grow relative"
      // `onMouseMove` as well as `onMouseEnter`, so moving around inside the
      // rail keeps deferring the resume rather than letting it fire while the
      // shopper is still looking. React's onFocus/onBlur bubble, so those two
      // behave as focus-within.
      onMouseEnter={nudge}
      onMouseMove={nudge}
      onFocus={() => setFocusHeld(true)}
      onBlur={() => setFocusHeld(false)}
    >
      <ul
        ref={trackRef}
        onScroll={handleScroll}
        // The scrollbar is hidden on all three engines. The arrows and the half
        // card visible either side are the affordance; a native bar under a
        // full-bleed rail read as a stray browser control rather than part of
        // the design. Scrolling itself is untouched — wheel, trackpad, touch
        // and keyboard all still work.
        //
        // No side padding: with a loop there is always a copy either side, so
        // nothing needs artificial room to reach the centre. That padding is
        // what the previous non-looping version used, and it is also why the
        // card width below is a plain 50% again rather than `w-full`.
        className="flex h-full snap-x snap-mandatory gap-4 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {slides.map((item, index) => {
          // Copy 1 of 3 is the real one; the outer two are visual filler.
          const isClone = looping && (index < items.length || index >= items.length * 2);
          return (
            <li
              key={`${item.id}-${index}`}
              aria-hidden={isClone || undefined}
              className="w-[86%] shrink-0 snap-center sm:w-[70%] lg:h-full lg:w-[50%]"
            >
              <article className="flex flex-col lg:h-full">
                {/* The banner is the card's link target. 16:9 below lg, where the
                    section is free to be as tall as it likes — that is the shape
                    a collection's heroImage is authored at. From lg it takes
                    whatever height the card has left instead.

                    `min-h-0` is what allows that shrinking: a flex item defaults
                    to min-height:auto and would refuse to go below the image's
                    intrinsic height, pushing the section back past the fold. */}
                <Link
                  href={`/collections/${item.slug}`}
                  transitionTypes={["nav-forward"]}
                  tabIndex={isClone ? -1 : undefined}
                  className="group relative block aspect-[16/9] overflow-hidden bg-muted lg:aspect-auto lg:min-h-0 lg:flex-1"
                >
                  <Image
                    src={item.banner}
                    alt={item.title}
                    fill
                    sizes="(max-width: 640px) 86vw, (max-width: 1024px) 70vw, 50vw"
                    className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.02]"
                  />
                </Link>

                {/* The pieces, hanging off the banner's lower edge and centred on
                    it. Centred rather than left-aligned because the row is a
                    caption to the whole picture, not an index down one side.

                    `-mt-[9%]` rather than a pixel value: the overlap has to stay
                    proportional to the card, which is a percentage of the rail
                    and therefore of the viewport. A fixed pull looks right at one
                    width and swallows the thumbnails at another.

                    Rendered only when the collection resolved some products — a
                    card with none is its banner, not a banner with a gap. */}
                {item.products.length > 0 && (
                  <div className="relative z-10 -mt-[9%] flex justify-center gap-3 px-[6%]">
                    {item.products.map((product) => (
                      <Link
                        key={product.id}
                        href={`/products/${product.slug}`}
                        transitionTypes={["nav-forward"]}
                        tabIndex={isClone ? -1 : undefined}
                        className="relative aspect-square w-[22%] overflow-hidden bg-background shadow-[0_1px_12px_rgba(0,0,0,0.10)]"
                      >
                        <Image
                          src={product.image}
                          alt={product.name}
                          fill
                          sizes="(max-width: 640px) 20vw, 15vw"
                          className="object-cover"
                        />
                      </Link>
                    ))}
                  </div>
                )}

                <h3 className="mt-5 text-h3 font-medium">
                  <Link
                    href={`/collections/${item.slug}`}
                    transitionTypes={["nav-forward"]}
                    tabIndex={isClone ? -1 : undefined}
                  >
                    {item.title}
                  </Link>
                </h3>
              </article>
            </li>
          );
        })}
      </ul>

      {/* Arrows. Hidden below lg, where the rail is swiped rather than clicked
          and a 44px control over the artwork costs more than it gives.

          Never disabled: the rail loops, so both directions always lead
          somewhere. A control that greys out tells the shopper they have hit a
          limit, and here there isn't one. */}
      <button
        type="button"
        aria-label="Previous collections"
        onClick={() => page(-1)}
        className="absolute left-2 top-[28%] hidden size-11 items-center justify-center bg-background/90 text-foreground backdrop-blur-sm transition-colors hover:bg-background lg:flex"
      >
        <ChevronLeft className="size-5" />
      </button>
      <button
        type="button"
        aria-label="Next collections"
        onClick={() => page(1)}
        className="absolute right-2 top-[28%] hidden size-11 items-center justify-center bg-background/90 text-foreground backdrop-blur-sm transition-colors hover:bg-background lg:flex"
      >
        <ChevronRight className="size-5" />
      </button>
    </div>
  );
}
