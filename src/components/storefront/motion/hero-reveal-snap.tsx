"use client";

import { useEffect } from "react";
import { useLenis } from "lenis/react";
import Snap from "lenis/snap";

/**
 * Makes the pinned category band a place the page comes to rest at.
 *
 * ── The problem this solves ──────────────────────────────────────────────────
 * The reveal (see the categoryTiles branch in homepage-section.tsx) uncovers the
 * band over 100svh of scroll and then holds it for 50svh. The hold gives the
 * band somewhere to SIT, but nothing makes a scroll gesture actually LAND
 * there — flick hard and you sail straight past the thing you were scrolling
 * to. Two snap points fix that: the top of the page, and the exact offset where
 * the hero has finished clearing.
 *
 * ── Why not scroll-snap-type ─────────────────────────────────────────────────
 * It was the first thing tried and it is not usable here. CSS scroll snap
 * resolves snap areas against an element's scroll-time position, and the band
 * is `position: sticky` — its snap area is pinned to the viewport top for the
 * whole reveal, so it is degenerate: every scroll offset looks equally snapped.
 * Lenis's Snap takes explicit offsets instead, which sidesteps the sticky
 * interaction entirely. (Its `addElement` has an `ignoreSticky` option for the
 * same reason; explicit offsets are simpler still, because the offset we want
 * is a property of the HERO's height, not the band's.)
 *
 * ── Why proximity, not mandatory ─────────────────────────────────────────────
 * `mandatory` locks every scroll on the page to a snap point, so a shopper
 * heading for the footer gets dragged back twice on the way. `proximity` only
 * engages when the gesture already ended near a point, which is the difference
 * between the page helping and the page arguing.
 *
 * ── Lifetime ─────────────────────────────────────────────────────────────────
 * Rendered from inside the reveal branch itself, so it exists exactly when the
 * reveal exists — not when the homepage renders, and never on a route where an
 * editor has reordered the tiles away from the top. Unmounting on navigation is
 * what tears the snap points down; there is no pathname watching anywhere in
 * this feature.
 *
 * Returns null on mobile without doing anything: the provider only attaches
 * Lenis at 1024px and up, so `useLenis()` is undefined below that and the whole
 * effect no-ops. Same for reduced motion.
 */
export function HeroRevealSnap({ stages }: { stages: number }) {
  const lenis = useLenis();

  useEffect(() => {
    if (!lenis) return;

    // The hero owns the geometry: the reveal completes when the hero's own
    // height has scrolled past, whatever that height resolves to. Reading it
    // rather than hardcoding 100svh means a browser that resolves svh
    // differently, or a hero that ever stops being full-height, stays correct.
    const hero = document.querySelector<HTMLElement>("[data-hero-full]");
    if (!hero) return;

    const snap = new Snap(lenis, {
      type: "proximity",
      // Only engage within a fifth of the viewport of a point. Wider than this
      // and it starts catching scrolls that were aimed past the band.
      distanceThreshold: "20%",
      duration: 1,
      // Longer than the 500ms default. The reveal is a deliberately slow
      // gesture and a shopper often pauses mid-way; snapping while they are
      // still moving reads as the page snatching the scroll off them.
      debounce: 300,
    });

    /**
     * Recomputed on resize because both offsets are viewport-derived. `snap.add`
     * returns its own remover, so the previous pair is dropped rather than
     * accumulating a new pair on every resize event.
     */
    /**
     * One point per stage, plus the top of the page.
     *
     * Every stage in the chain is exactly one viewport tall and is pulled up by
     * exactly one viewport, so stage N finishes being uncovered at N × the
     * hero's height. That single multiple is the whole reason the chain needs
     * no per-section measurement here: the geometry is uniform by construction,
     * and the hero is the one element that defines the unit.
     *
     * Recomputed on resize because the unit is viewport-derived. `snap.add`
     * returns its own remover, so the previous set is dropped rather than
     * accumulating a new set on every resize event.
     */
    let removers: Array<() => void> = [];
    const compute = () => {
      for (const remove of removers) remove();
      // 0 is the top of the page — so a small scroll back up settles on the
      // hero rather than stranding it half-lifted. Then one per stage.
      removers = Array.from({ length: stages + 1 }, (_, i) =>
        snap.add(i * hero.offsetHeight)
      );
    };

    compute();
    window.addEventListener("resize", compute);

    return () => {
      window.removeEventListener("resize", compute);
      for (const remove of removers) remove();
      snap.destroy();
    };
  }, [lenis, stages]);

  return null;
}
