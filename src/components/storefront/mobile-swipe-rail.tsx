"use client";

import { useEffect, useRef, useState } from "react";
import { usePointerPause } from "@/lib/use-pointer-pause";
import { cn } from "@/lib/utils";

/**
 * A phone-only horizontal rail, wrapped around a section's existing grid.
 *
 * Sections like "Inspired by Love" and "The collections" are composed for a
 * wide screen — a row of four, a stagger, a three-up grid — and below that they
 * simply stack. Stacked, a four-tile section is four full-height scrolls of
 * photography before the next heading, which is a long way to travel to learn
 * there were four of something.
 *
 * ── Why scroll-snap and not a transform carousel ─────────────────────────────
 * The gesture is the browser's own. Native inertia, rubber-banding at the ends,
 * and the exact feel of every other horizontal list on the phone — none of
 * which a touch handler translating into `translateX` reproduces convincingly.
 * It also stays a scrollable list for anything that is not a finger: a keyboard
 * can tab through the tiles and the browser scrolls them into view, and a
 * screen reader meets them in source order. JavaScript here only advances the
 * scroll position on a timer; with it switched off the rail still swipes.
 *
 * ── One DOM, two layouts ─────────────────────────────────────────────────────
 * The children are rendered once and the CONTAINER changes at `md`. Rendering
 * a mobile copy and a desktop copy would duplicate every tile in the document —
 * twice the images to a crawler, and a screen reader walking the same section
 * twice.
 *
 * ── The autoplay rules, which are mostly about when NOT to ───────────────────
 *  - `prefers-reduced-motion` stops it, watched live rather than read once, so
 *    toggling it in the OS takes effect immediately.
 *  - A hidden tab stops it; there is nobody to show it to.
 *  - A rail scrolled out of view stops it, via IntersectionObserver.
 *  - A touch pauses it briefly and it resumes on its own (see usePointerPause).
 *  - Keyboard focus inside it holds indefinitely — WCAG 2.2.2. Someone reading
 *    tile three with a keyboard must not be carried to tile four mid-sentence.
 *  - Above `md` it never runs at all: the desktop composition shows everything
 *    at once and has nothing to advance through.
 */

/** Long enough to read a tile, short enough to suggest there is another. */
const AUTOPLAY_MS = 3800;

/** Matches Tailwind's `md`, the breakpoint the rail styles stop at. */
const MOBILE_QUERY = "(max-width: 767px)";

export function MobileSwipeRail({
  children,
  /**
   * The section's existing grid classes, passed through untouched.
   *
   * ⚠️  The rail styles are `max-md:` rather than these being `md:`, and that
   * is forced rather than chosen. `.grid-gutter`, `.fit-grow` and friends are
   * hand-written CSS in globals.css, not Tailwind `@utility` declarations, so
   * `md:grid-gutter` generates nothing at all — Tailwind cannot make a variant
   * of a class it does not own. Scoping the OVERRIDES to small screens instead
   * leaves every desktop composition exactly as its author wrote it.
   */
  className,
  /**
   * Tile width on a phone, as a raw CSS length.
   *
   * A length rather than a Tailwind class on purpose: an interpolated
   * `basis-[${x}]` is invisible to Tailwind's scanner, which only ever sees
   * source text, so the class would simply never be generated. It is fed
   * through a custom property instead, which is static in the markup and
   * dynamic at runtime.
   *
   * The default leaves the next tile peeking — an edge-to-edge tile gives no
   * hint that swiping does anything, and the peek is the whole affordance.
   */
  basis = "82%",
}: {
  children: React.ReactNode;
  className?: string;
  basis?: string;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);

  const [isMobile, setIsMobile] = useState(false);
  const [motionAllowed, setMotionAllowed] = useState(true);
  const [documentHidden, setDocumentHidden] = useState(false);
  const [onScreen, setOnScreen] = useState(false);
  const [focusHeld, setFocusHeld] = useState(false);
  /**
   * Bumped once each time the rail's scrolling settles.
   *
   * This is what re-arms the advance timer below — see the note on its
   * dependency array. Declared here with the rest of the state because the
   * effect that reads it runs first.
   */
  const [scrollTick, setScrollTick] = useState(0);

  const { paused: pointerPaused, nudge } = usePointerPause(6000);

  /**
   * Direction of travel, for the ping-pong below. A ref rather than state:
   * it changes inside the timer and must not itself schedule a render.
   */
  const direction = useRef<1 | -1>(1);

  // Both watched, not sampled — the same reasoning as the hero carousel.
  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const mobile = window.matchMedia(MOBILE_QUERY);
    const syncMotion = () => setMotionAllowed(!motion.matches);
    const syncMobile = () => setIsMobile(mobile.matches);
    syncMotion();
    syncMobile();
    motion.addEventListener("change", syncMotion);
    mobile.addEventListener("change", syncMobile);
    return () => {
      motion.removeEventListener("change", syncMotion);
      mobile.removeEventListener("change", syncMobile);
    };
  }, []);

  useEffect(() => {
    const sync = () => setDocumentHidden(document.hidden);
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setOnScreen(entry.isIntersecting),
      // A little of it is enough — this is "is anyone looking", not "is it read".
      { threshold: 0.25 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const autoplaying =
    isMobile && motionAllowed && onScreen && !documentHidden && !focusHeld && !pointerPaused;

  /**
   * Advance by one tile, reversing at each end.
   *
   * Ping-pong rather than wrapping to the start. Wrapping means a smooth scroll
   * all the way back across every tile, which reads as the rail rewinding
   * itself — fine for a full-bleed hero that cross-fades, wrong for a short row
   * where the whole journey is visible. Walking back looks like browsing.
   *
   * The step is measured from the first child rather than assumed, so it stays
   * correct whatever `basis` the caller passes and however the gap renders.
   */
  useEffect(() => {
    if (!autoplaying) return;
    const el = trackRef.current;
    if (!el) return;

    const timer = setTimeout(() => {
      const first = el.firstElementChild as HTMLElement | null;
      if (!first) return;

      const gap = parseFloat(getComputedStyle(el).columnGap || "0") || 0;
      const step = first.offsetWidth + gap;

      // A tolerance, because scrollLeft is fractional on a zoomed or
      // high-density screen and an exact comparison never matches the end.
      const maxScroll = el.scrollWidth - el.clientWidth;
      if (direction.current === 1 && el.scrollLeft >= maxScroll - 4) direction.current = -1;
      else if (direction.current === -1 && el.scrollLeft <= 4) direction.current = 1;

      el.scrollBy({ left: step * direction.current, behavior: "smooth" });
    }, AUTOPLAY_MS);

    return () => clearTimeout(timer);
    // `scrollTick` is the re-arm: this effect schedules ONE move, so without a
    // dependency that changes after each one it would fire once and stop. Every
    // settled scroll — the timer's own, or a shopper's swipe — bumps the tick
    // and starts a fresh interval, which also gives a manually chosen tile its
    // full hold instead of moving on half a second later.
  }, [autoplaying, scrollTick]);

  /** Ticks once the rail's scrolling has settled, however it was caused. */
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    let idle: ReturnType<typeof setTimeout>;
    const onScroll = () => {
      clearTimeout(idle);
      // Only once the scroll has settled — mid-gesture is not a new tick.
      idle = setTimeout(() => setScrollTick((n) => n + 1), 180);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      clearTimeout(idle);
    };
  }, []);
  return (
    <div
      ref={trackRef}
      style={{ "--rail-basis": basis } as React.CSSProperties}
      onTouchStart={nudge}
      onPointerDown={nudge}
      onFocusCapture={() => setFocusHeld(true)}
      onBlurCapture={(event) => {
        // Only when focus has actually left the rail, not on every hop between
        // tiles inside it.
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setFocusHeld(false);
        }
      }}
      className={cn(
        // The desktop composition first, so the rail overrides below can win.
        className,
        // ── Phone only, everything below ─────────────────────────────────
        // `flex` displaces the section's `grid`; the grid-column classes it
        // carries go inert with it, so `sm:grid-cols-2` and friends need no
        // unpicking. `.grid-gutter`'s 1rem column-gap becomes the rail's gap.
        "max-md:flex max-md:snap-x max-md:snap-mandatory max-md:overflow-x-auto",
        // Keeps a sideways flick from turning into a back-navigation gesture
        // or scrolling the page behind the rail.
        "max-md:overscroll-x-contain",
        // No scrollbar: the peeking tile already says there is more, and on
        // iOS it is a fading overlay that says nothing at rest.
        "max-md:[scrollbar-width:none] max-md:[&::-webkit-scrollbar]:hidden",
        "max-md:[&>*]:shrink-0 max-md:[&>*]:snap-start",
        "max-md:[&>*]:basis-[var(--rail-basis)]"
      )}
    >
      {children}
    </div>
  );
}
