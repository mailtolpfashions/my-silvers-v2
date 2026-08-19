"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { BrandLoader } from "@/components/storefront/brand-loader";

/**
 * Feedback while a navigation is in flight.
 *
 * Until this existed a click on a slow route gave the shopper nothing at all —
 * the old page simply sat there, which reads as a dead link and earns a second
 * click. Route-level `loading.tsx` skeletons cover the gap AFTER the navigation
 * commits; this covers the gap before it, which is the part that was silent.
 *
 * ── Why a document listener rather than useLinkStatus ────────────────────────
 * Next's `useLinkStatus` is the sanctioned hook and it is the right tool for a
 * spinner ON one link — but it only works inside a `<Link>` subtree, so a
 * global indicator would mean wrapping every Link on the storefront in a custom
 * component and remembering to use it forever. One capture-phase listener on
 * the document costs nothing and cannot be forgotten.
 *
 * The trade is that this infers intent from a click rather than being told by
 * the router, so the guards in `onClick` are load-bearing — each one is a click
 * that does NOT start a client-side navigation and must not raise the loader.
 */

/**
 * How long a navigation must take before the shopper sees anything.
 *
 * Most routes here are prefetched and commit in well under this, and a loader
 * that flashes for 80ms is worse than no loader — it reads as the page
 * flinching. Only navigations slow enough to feel slow get an indicator.
 */
const SHOW_AFTER_MS = 180;

/**
 * Backstop for a navigation that never lands and never changes the URL — a
 * failed request, a 500, or a route that redirects to the page it was already
 * on. Without it the indicator would sit there until the next click.
 *
 * Six seconds rather than ten: past about this point the shopper has stopped
 * reading the indicator as "working" and started reading it as "broken", and
 * whatever they do next is better served by a page with nothing on it than by
 * a page still claiming to be busy.
 */
const GIVE_UP_AFTER_MS = 6_000;

export function NavigationLoader() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Search params are part of the identity: changing a filter on a listing page
  // is a navigation, and it must take the loader down like any other.
  const search = searchParams.toString();
  const routeKey = search ? `${pathname}?${search}` : pathname;

  const [pending, setPending] = useState(false);
  const [seenKey, setSeenKey] = useState(routeKey);

  const showTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  /**
   * The navigation landed — take the loader down.
   *
   * Adjusted DURING RENDER rather than in an effect, and that is deliberate on
   * two counts. React handles this by re-rendering before it commits, so the
   * loader never paints over the page it was waiting for; an effect would show
   * it for one frame on top of the arrived content. It is also the only form
   * the project's `react-hooks/set-state-in-effect` rule permits — see
   * https://react.dev/learn/you-might-not-need-an-effect.
   *
   * Keying off "the URL changed since the last render" rather than "the URL
   * equals where we started" matters: the latter re-triggers the loader if the
   * shopper navigates BACK to the page they set out from.
   */
  if (seenKey !== routeKey) {
    setSeenKey(routeKey);
    if (pending) setPending(false);
  }

  /**
   * Disarm a show-timer the landed navigation left behind.
   *
   * Separate from the render-time reset above only because refs cannot be read
   * during render. It has to exist: a navigation that commits in 100ms would
   * otherwise still have a show-timer due at 180ms, which would raise the chip
   * over a page that had already arrived.
   *
   * No setState here, which is what keeps it on the right side of the
   * set-state-in-effect rule — this effect only talks to the timer API.
   */
  useEffect(() => {
    clearTimeout(showTimer.current);
  }, [routeKey]);

  /**
   * The dead-man's switch: once the chip is UP, it comes down.
   *
   * ⚠️  Keyed on `pending`, not armed at click time, and that distinction is
   * the whole point. The give-up timer used to be started in the click handler
   * alongside the show-timer — which meant the effect above, cancelling stale
   * timers on a URL change, cancelled the safety net too. Any navigation whose
   * URL updated while the chip was already showing disarmed the only thing
   * left that could hide it, and the chip sat there indefinitely. Reported at
   * 60+ seconds; there was no upper bound at all.
   *
   * Tied to the state it guards, nothing else can reach it. The effect only
   * re-runs when `pending` actually flips, so repeated arming cannot extend a
   * showing either.
   *
   * setState in a CALLBACK, not in the effect body — the project's
   * react-hooks/set-state-in-effect rule permits this and rejects the other.
   */
  useEffect(() => {
    if (!pending) return;
    const fuse = setTimeout(() => setPending(false), GIVE_UP_AFTER_MS);
    return () => clearTimeout(fuse);
  }, [pending]);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      // Something already handled it, or it is not a plain left click. The
      // modifier checks matter: cmd/ctrl-click opens a new tab and leaves this
      // page exactly where it is.
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const anchor = (event.target as Element | null)?.closest?.("a");
      if (!anchor) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;

      const href = anchor.getAttribute("href");
      // No href, or a bare `#`: a button wearing an <a>.
      if (!href || href.startsWith("#")) return;

      let url: URL;
      try {
        url = new URL(anchor.href, window.location.href);
      } catch {
        return;
      }
      // mailto:, tel:, and anything off-site leave the app entirely — the
      // browser draws its own progress for those.
      if (url.origin !== window.location.origin) return;

      // Same page. A hash link scrolls, it does not navigate.
      if (url.pathname === window.location.pathname && url.search === window.location.search) {
        return;
      }

      clearTimeout(showTimer.current);
      showTimer.current = setTimeout(() => setPending(true), SHOW_AFTER_MS);
    }

    // Capture phase, so a handler that calls stopPropagation on the way up
    // cannot hide the click from this.
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      clearTimeout(showTimer.current);
    };
  }, []);

  if (!pending) return null;

  return (
    <div
      /**
       * A small chip under the header — NOT a full-screen scrim.
       *
       * ⚠️  This was `fixed inset-0` with `bg-background/70 backdrop-blur`, and
       * that was wrong in a way only a failure shows. A navigation that never
       * lands never changes the URL, so nothing takes the indicator down but
       * the give-up timer — and for those seconds a full-bleed wash made the
       * entire shop look dead rather than busy. A stuck chip is a small
       * artefact in a corner; a stuck scrim is an outage.
       *
       * The failure case is not rare, either: any 500, any dropped connection,
       * any route that redirects to the page it was already on.
       *
       * pointer-events-none because this is an indicator, not a modal — a
       * shopper who thinks better of the click keeps the header, the back
       * button and every link beneath it.
       *
       * z-[60] clears the header (40) and Radix overlays (50), so a dialog
       * linking onward cannot paint over its own loader.
       *
       * ── Bottom-LEFT, and every other side is spoken for ──────────────────
       * It sat under the header first, which on a full-bleed hero dropped a
       * white box over the middle of the photograph — the one place on the
       * site guaranteed to be someone's face.
       *
       * Bottom-right is the Toaster. Bottom-centre is the mobile sticky action
       * bar on product and cart pages. That leaves bottom-left, and the raised
       * `bottom-28` below sm is what clears that bar on phones:
       * STICKY_BAR_SPACER reserves 7rem for it, so this sits just above.
       */
      className="pointer-events-none fixed bottom-28 left-4 z-[60] sm:bottom-6 sm:left-6"
    >
      <span className="flex items-center justify-center border bg-background/95 px-4 py-2.5 shadow-sm backdrop-blur-sm">
        <BrandLoader size={26} />
      </span>
    </div>
  );
}
