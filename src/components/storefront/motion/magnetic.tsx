"use client";

import { useRef, type ReactNode } from "react";
import { gsap, useGSAP, MOTION_QUERY } from "@/lib/gsap";

/**
 * Pulls its child gently toward the cursor while the pointer is over it.
 *
 * Carried over from the old store's MagneticButton, with the spring swapped for
 * gsap.quickTo — the effect is identical and it allocates one tween instead of
 * one per mousemove.
 *
 * `(pointer: fine)` only, and not merely for taste: on a touch device the
 * pointer events fire on tap, so the button would jump under the finger at the
 * exact moment it is being pressed.
 *
 * Wraps rather than styles, so the child can be any button or link and keeps
 * its own focus ring and hit area. Keep `strength` low — this should be felt
 * more than seen, and a button that outruns the cursor reads as broken.
 */
export function Magnetic({
  children,
  strength = 0.25,
  className = "",
}: {
  children: ReactNode;
  strength?: number;
  className?: string;
}) {
  const scope = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const el = scope.current;
      if (!el) return;

      const mm = gsap.matchMedia();

      mm.add(MOTION_QUERY.pointer, () => {
        const moveX = gsap.quickTo(el, "x", { duration: 0.4, ease: "power3.out" });
        const moveY = gsap.quickTo(el, "y", { duration: 0.4, ease: "power3.out" });

        const onMove = (event: PointerEvent) => {
          const box = el.getBoundingClientRect();
          moveX((event.clientX - (box.left + box.width / 2)) * strength);
          moveY((event.clientY - (box.top + box.height / 2)) * strength);
        };

        // Also on blur/leave: a keyboard user tabbing away from a button the
        // mouse happened to be near would otherwise leave it displaced.
        const reset = () => {
          moveX(0);
          moveY(0);
        };

        el.addEventListener("pointermove", onMove);
        el.addEventListener("pointerleave", reset);

        return () => {
          el.removeEventListener("pointermove", onMove);
          el.removeEventListener("pointerleave", reset);
          gsap.set(el, { x: 0, y: 0 });
        };
      });

      return () => mm.revert();
    },
    { scope, dependencies: [strength] },
  );

  return (
    <div ref={scope} className={`inline-block ${className}`}>
      {children}
    </div>
  );
}
