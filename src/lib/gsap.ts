/**
 * The one place GSAP plugins are registered.
 *
 * Registration mutates a global, so doing it per component means every one of
 * them has to remember — and forgetting produces a silent no-op rather than an
 * error. Import gsap from here, never from "gsap" directly.
 *
 * Guarded on `window` because this module is reachable from the server render:
 * ScrollTrigger touches document at registration time.
 */
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { useGSAP } from "@gsap/react";

if (typeof window !== "undefined") {
  // useGSAP is registered alongside the plugins so the hook's cleanup is wired
  // in before any component calls it.
  gsap.registerPlugin(useGSAP, ScrollTrigger, SplitText);
}

/**
 * Every animation on the storefront goes through one of these two.
 *
 * `DESKTOP` gates anything pinned, parallaxed or pointer-driven. The width test
 * is deliberate and not just a pointer test: pinning on a phone means fighting
 * the browser's own address-bar collapse, which resizes the viewport mid-scroll
 * and leaves pinned sections jumping.
 *
 * Both carry `prefers-reduced-motion: no-preference`, so a visitor who has
 * asked for less motion gets the page with none of this attached — not a
 * faster version of it.
 */
export const MOTION_QUERY = {
  desktop: "(min-width: 1024px) and (prefers-reduced-motion: no-preference)",
  all: "(prefers-reduced-motion: no-preference)",
  /** Hover-capable pointers only — magnetic buttons and the cursor light. */
  pointer: "(pointer: fine) and (prefers-reduced-motion: no-preference)",
} as const;

export { gsap, ScrollTrigger, SplitText, useGSAP };
