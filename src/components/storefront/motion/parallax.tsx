"use client";

import { useRef, type ReactNode } from "react";
import { gsap, useGSAP, MOTION_QUERY } from "@/lib/gsap";

/**
 * Moves its contents against the scroll, slower than the page.
 *
 * Fills its nearest positioned ancestor, so the caller supplies the frame —
 * a `relative overflow-hidden` box — and this supplies the movement. Anything
 * inside sizing itself with `fill` or `inset-0` lands correctly.
 *
 * Two details that separate a parallax that works from one that shows its
 * seams:
 *
 * 1. The layer is scaled up by the travel distance. Translating a layer that
 *    exactly fills its frame drags an empty edge into view at one end of the
 *    scroll; the overscale is what pays for the movement.
 * 2. `ease: "none"` with `scrub`. Any other ease means the layer's position
 *    stops matching the scroll position, which reads as lag rather than depth.
 *
 * Desktop only. On a phone the address bar collapsing mid-scroll resizes the
 * viewport, and every scrubbed animation on the page jumps at that moment.
 */
export function Parallax({
  children,
  /** Travel as a percentage of the layer's height. Keep it small. */
  amount = 12,
  className = "",
}: {
  children: ReactNode;
  amount?: number;
  className?: string;
}) {
  const scope = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      mm.add(MOTION_QUERY.desktop, () => {
        gsap.set(scope.current, { scale: 1 + amount / 100, transformOrigin: "center center" });

        gsap.fromTo(
          scope.current,
          { yPercent: -amount / 2 },
          {
            yPercent: amount / 2,
            ease: "none",
            scrollTrigger: {
              trigger: scope.current,
              // Bottom-of-viewport to top-of-viewport: the full time the layer
              // is on screen, so the movement is spread across the whole pass
              // rather than finishing early.
              start: "top bottom",
              end: "bottom top",
              scrub: true,
            },
          },
        );
      });

      return () => mm.revert();
    },
    { scope, dependencies: [amount] },
  );

  return (
    <div ref={scope} className={`absolute inset-0 ${className}`}>
      {children}
    </div>
  );
}
