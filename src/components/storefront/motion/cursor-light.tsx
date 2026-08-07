"use client";

import { useEffect, useRef } from "react";
import { gsap, MOTION_QUERY } from "@/lib/gsap";

/**
 * A soft warm light that trails the pointer.
 *
 * Carried over from the previous storefront's global light system. It is doing
 * one job: an ivory page is flat, and a slow-moving highlight gives it the
 * suggestion of a surface catching light — which is the right association for
 * a shop selling polished metal.
 *
 * `(pointer: fine)` only, so it never mounts a listener on a touch device where
 * there is no cursor to follow.
 *
 * The movement is driven by gsap.quickTo rather than React state on purpose:
 * state would re-render this component on every mousemove, which is 60 renders
 * a second for a div that never changes its markup.
 */
export function CursorLight({ size = 700, opacity = 0.22 }: { size?: number; opacity?: number }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const allowed = window.matchMedia(MOTION_QUERY.pointer);
    if (!allowed.matches) return;

    // quickTo returns a setter that reuses one tween instead of allocating a
    // new one per event. 0.7s of catch-up is what makes it read as a light
    // source with weight rather than a cursor decoration.
    const moveX = gsap.quickTo(el, "x", { duration: 0.7, ease: "power3.out" });
    const moveY = gsap.quickTo(el, "y", { duration: 0.7, ease: "power3.out" });

    const onMove = (event: PointerEvent) => {
      moveX(event.clientX - size / 2);
      moveY(event.clientY - size / 2);
    };

    // The light is invisible until the pointer first moves, so it never flashes
    // in the top-left corner on load.
    const onFirstMove = () => gsap.to(el, { autoAlpha: 1, duration: 0.6 });

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointermove", onFirstMove, { passive: true, once: true });

    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointermove", onFirstMove);
      gsap.killTweensOf(el);
    };
  }, [size]);

  return (
    <div
      ref={ref}
      aria-hidden
      // z-[104] sits directly under the vignette and grain, so the light is
      // part of the same atmosphere stack rather than painted over it.
      className="pointer-events-none fixed left-0 top-0 z-[104] hidden opacity-0 mix-blend-soft-light lg:block"
      style={{
        width: size,
        height: size,
        background: `radial-gradient(circle closest-side, rgba(201,169,110,${opacity}), transparent)`,
      }}
    />
  );
}
