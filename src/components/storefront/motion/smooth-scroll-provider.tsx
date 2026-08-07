"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import Lenis from "lenis";
import { gsap, ScrollTrigger } from "@/lib/gsap";

/**
 * Smooth scrolling, desktop only.
 *
 * Lenis rather than GSAP's own ScrollSmoother, and the reason is structural:
 * ScrollSmoother transforms a wrapper element, which makes that wrapper a
 * containing block and breaks every `position: fixed` descendant. This
 * storefront has several — the sticky action bar, the mobile filter bar, and
 * both atmosphere overlays. Lenis drives the real scroll position instead, so
 * `fixed` keeps meaning fixed.
 *
 * Off below 1024px and off for anyone who has asked for reduced motion. Touch
 * devices already have momentum scrolling tuned by the OS; layering an
 * interpolator on top of it makes the page feel slippery rather than smooth,
 * and costs a frame budget phones do not have.
 */
export function SmoothScrollProvider() {
  const pathname = usePathname();

  useEffect(() => {
    const allowed = window.matchMedia(
      "(min-width: 1024px) and (prefers-reduced-motion: no-preference)",
    );
    if (!allowed.matches) return;

    const lenis = new Lenis({
      // The old store's feel, carried over: a long duration with a steep
      // exponential ease reads as weight rather than lag.
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      wheelMultiplier: 1,
    });

    // ScrollTrigger reads scroll position from the browser; Lenis writes it on
    // its own schedule. Without this the two disagree by a frame and every
    // scrubbed animation lags behind the page.
    lenis.on("scroll", ScrollTrigger.update);

    // One rAF loop for both libraries rather than two competing ones. GSAP's
    // ticker reports seconds, Lenis wants milliseconds.
    const tick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);

    // lagSmoothing clamps the delta after a tab switch so animations don't jump
    // forward. It has to be off while Lenis is driving: the clamp desynchronises
    // Lenis's interpolation from the real scroll position.
    gsap.ticker.lagSmoothing(0);

    return () => {
      lenis.destroy();
      gsap.ticker.remove(tick);
      gsap.ticker.lagSmoothing(500, 33);
    };
  }, []);

  // A route change has to land at the top instantly. Lenis owns the scroll
  // position, so Next's own restoration is overridden — and animating the jump
  // would mean watching the previous page's footer scroll past on arrival.
  // Also refreshes ScrollTrigger: the new page is a different document height.
  useEffect(() => {
    ScrollTrigger.refresh();
  }, [pathname]);

  return null;
}
