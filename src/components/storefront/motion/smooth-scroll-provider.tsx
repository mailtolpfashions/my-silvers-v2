"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ReactLenis, useLenis } from "lenis/react";
import type { LenisOptions } from "lenis";
import "lenis/dist/lenis.css";

/**
 * Smooth scrolling, desktop only.
 *
 * ── Why this exists again ────────────────────────────────────────────────────
 * Lenis was added once, then removed in ef2fe2d after bucherer.com was measured
 * and found to run no animation JavaScript at all. That measurement still
 * stands and it is still the reason nothing else on this site is animated in
 * JS. What brought Lenis back is a specific behaviour the reference does NOT
 * have and that CSS cannot express: making the pinned category band a place the
 * page comes to REST at. `scroll-snap-type` was the CSS answer and it is not
 * usable here — it conflicts with `position: sticky`, which the reveal is built
 * out of. See hero-reveal-snap.tsx, which is the whole point of this file.
 *
 * So the bar for anything else using this instance is high: smooth scrolling is
 * the carrier, the snap is the payload.
 *
 * ── Lenis rather than ScrollSmoother ─────────────────────────────────────────
 * Structural, and unchanged from the first time round: ScrollSmoother transforms
 * a wrapper element, which makes it a containing block and breaks every
 * `position: fixed` descendant. This storefront has several — the sticky action
 * bar, the mobile filter bar, both atmosphere overlays. Lenis drives the real
 * scroll position, so `fixed` keeps meaning fixed, `sticky` keeps meaning
 * sticky, and `animation-timeline: view()` on the tile drift keeps working
 * because there is a real scroll for it to be driven by.
 *
 * ── Desktop only ─────────────────────────────────────────────────────────────
 * Off below 1024px and off under prefers-reduced-motion. A phone's momentum
 * scrolling is tuned by the OS; interpolating on top of it feels slippery
 * rather than smooth, and costs a frame budget phones do not have. The query is
 * watched rather than read once, so changing the OS setting or resizing across
 * the breakpoint takes effect without a reload — and returning `null` genuinely
 * tears the instance down rather than leaving a dormant one attached.
 *
 * ── Owning the scroll means owning navigation too ────────────────────────────
 * Because Lenis drives the real scroll position, it also has to be told when a
 * navigation happens — Next's own scroll reset does not survive contact with
 * it. See LenisNavigationReset at the foot of this file. Anything added here
 * that caches a scroll offset carries the same obligation.
 */

/**
 * Module-level, and that is load-bearing rather than tidiness.
 *
 * ReactLenis keys its setup effect on `JSON.stringify(options)`. An object
 * literal in the JSX would be a new identity every render, so Lenis would be
 * destroyed and reconstructed on each one — losing scroll position and any Snap
 * attached to it.
 */
const LENIS_OPTIONS: LenisOptions = {
  // The old store's feel, carried over: a long duration with a steep
  // exponential ease reads as weight rather than lag.
  duration: 1.2,
  easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
  smoothWheel: true,
  wheelMultiplier: 1,
  // Touch is left entirely to the OS — see the note above. This is the default,
  // spelled out because it is a decision rather than an omission.
  syncTouch: false,
  // In-page anchors ease instead of jumping, for free. The footer's "back to
  // top" and any #section link both benefit.
  anchors: true,
};

export function SmoothScrollProvider() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const query = window.matchMedia(
      "(min-width: 1024px) and (prefers-reduced-motion: no-preference)"
    );
    const sync = () => setEnabled(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  if (!enabled) return null;

  return (
    <>
      {/* `root` with no children: this attaches a global instance and renders
          no DOM, so the layout's tree is untouched. ReactLenis publishes that
          instance to its own root store, which is what lets useLenis() resolve
          from anywhere in the app rather than only inside a provider subtree. */}
      <ReactLenis root options={LENIS_OPTIONS} />
      <LenisResizeGuard />
      {/* usePathname needs a boundary under cacheComponents on any route with a
          dynamic param — /products/[slug], /blog/[slug], /category/[slug] are
          most of the storefront. The component renders null, so the hole this
          opens is empty and the rest of the route stays static. */}
      <Suspense fallback={null}>
        <LenisNavigationReset />
      </Suspense>
    </>
  );
}

/**
 * Puts the page back at the top when the shopper navigates.
 *
 * ⚠️  Without this, every client-side navigation lands mid-page. Clicking a
 * product from halfway down the homepage opened the product page already
 * scrolled past the photograph; the same held for checkout, the footer's policy
 * pages, and every other link on the storefront.
 *
 * Next DOES reset the scroll on navigation — it calls window.scrollTo(0, 0)
 * itself. The reset does not survive, because Lenis owns the scroll position:
 * it keeps its own `animatedScroll`/`targetScroll` and writes them back to the
 * window on the next animation frame, so Next's reset is overwritten a frame
 * after it happens. Telling the window is not enough; Lenis has to be told.
 *
 * This is why the bug is desktop-only, and that is the quickest way to confirm
 * it is this and not something else: below 1024px, or with reduced motion on,
 * the provider never attaches Lenis and navigation already lands at the top.
 *
 * ── Two navigations it deliberately keeps its hands off ──────────────────────
 * A link carrying a #hash asked for a position that is not the top, and the
 * `anchors: true` option above already eases Lenis to it.
 *
 * Back and forward are the browser restoring where the shopper was, on purpose.
 * Forcing those to the top would be a worse bug than the one being fixed, so a
 * popstate marks the next pathname change as a history traversal and this sits
 * it out. (Whether Lenis's cached position also goes stale on back/forward is a
 * separate question and not one this component answers — it only guarantees it
 * does not make it worse.)
 */
function LenisNavigationReset() {
  const pathname = usePathname();
  const lenis = useLenis();
  const traversedHistory = useRef(false);
  const navigated = useRef(false);

  useEffect(() => {
    const onPopState = () => {
      traversedHistory.current = true;
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (!lenis) return;

    // First run is mount, not a navigation. Reloading a page the browser has a
    // remembered offset for would otherwise be yanked to the top.
    if (!navigated.current) {
      navigated.current = true;
      return;
    }

    if (traversedHistory.current) {
      traversedHistory.current = false;
      return;
    }

    if (window.location.hash) return;

    // immediate: no smooth ride up a page the shopper has just left. force: the
    // scroll may be stopped or locked — by an open dialog, or the filter drawer
    // — and a navigation still has to land at the top.
    lenis.scrollTo(0, { immediate: true, force: true });
  }, [pathname, lenis]);

  return null;
}

/**
 * Hands Lenis the real scroll limit as the page grows.
 *
 * ⚠️  This is not optional and it is not a micro-optimisation. Lenis caches how
 * far the page can scroll and clamps to it. Its own autoResize watches the
 * wrapper and content elements, which for a window-scrolled page is <html> —
 * and <html> does not change size when content is appended inside <body>.
 *
 * `cacheComponents` is on in next.config.ts, so nearly every page here commits
 * a short static shell and streams the rest in. The cached limit is therefore
 * the height of a page that has not finished arriving. The symptom last time
 * was scrolling that stopped dead partway down with the footer unreachable —
 * 878px short on the product page. It is especially easy to reintroduce now,
 * because the homepage's reveal stage adds 250svh of height in a streamed
 * section.
 *
 * <body> does grow, so watch that and push the new limit in.
 *
 * A separate component rather than a second effect in the provider, because it
 * needs the instance AFTER ReactLenis has constructed it: ReactLenis holds it
 * in state, so a ref read in a sibling effect is still undefined on first pass.
 * useLenis() subscribes, so this re-runs the moment the instance exists.
 */
function LenisResizeGuard() {
  const lenis = useLenis();

  useEffect(() => {
    if (!lenis) return;
    const observer = new ResizeObserver(() => lenis.resize());
    observer.observe(document.body);
    return () => observer.disconnect();
  }, [lenis]);

  return null;
}
