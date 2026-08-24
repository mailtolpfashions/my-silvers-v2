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
 *
 * Raised from 180ms when the indicator became a full-screen scrim. A small
 * chip appearing briefly in a corner is easy to miss; the whole page blurring
 * and unblurring is not, so the bar for showing anything at all is higher now.
 */
const SHOW_AFTER_MS = 260;

/**
 * Backstop for a navigation that never lands and never changes the URL — a
 * failed request, a 500, or a route that redirects to the page it was already
 * on. Without it the indicator would sit there until the next click.
 *
 * Past about this point the shopper has stopped reading the indicator as
 * "working" and started reading it as "broken", and whatever they do next is
 * better served by a page with nothing on it than by a page still claiming to
 * be busy.
 *
 * Six seconds is safe again because the scrim no longer lasts that long — see
 * SCRIM_MS. What sits here after the first second and a half is a corner chip,
 * and six seconds of a chip is a curiosity rather than an outage.
 */
const GIVE_UP_AFTER_MS = 6_000;

/**
 * How long the full-screen scrim holds before it degrades to a corner chip.
 *
 * This is the answer to the scrim's one real hazard. A navigation that never
 * lands never changes the URL, so the indicator stays until the give-up timer
 * — and a full-bleed wash held for that whole window makes the shop look dead
 * rather than busy. Rather than choosing between "no scrim" and "an outage",
 * the scrim is simply time-boxed: it covers the common case, where a slow
 * navigation lands within a second or so, and then gets out of the way.
 *
 * Past this point the shopper is looking at a page they can read, with a small
 * chip in the corner still saying something is happening. That is a far better
 * thing to be wrong about, which is also why GIVE_UP_AFTER_MS could go back to
 * six seconds: the chip is cheap to leave up, the scrim is not.
 */
const SCRIM_MS = 1_400;

export function NavigationLoader() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Search params are part of the identity: changing a filter on a listing page
  // is a navigation, and it must take the loader down like any other.
  const search = searchParams.toString();
  const routeKey = search ? `${pathname}?${search}` : pathname;

  const [pending, setPending] = useState(false);
  /**
   * The scrim's time-box has elapsed and this navigation is still in flight.
   *
   * Separate from `pending` because it is a different question: `pending` is
   * "is something happening", `degraded` is "has it been happening long enough
   * that covering the page is no longer the honest thing to do".
   */
  const [degraded, setDegraded] = useState(false);
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
    // Or the next slow navigation would start already degraded.
    if (degraded) setDegraded(false);
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

  /**
   * The scrim's own fuse: after SCRIM_MS the overlay steps down to a chip.
   *
   * Keyed on `pending` for the same reason as the give-up timer above — tied
   * to the state it governs, so a URL change cannot cancel it out from under
   * itself. It fires at most once per showing, because `degraded` only ever
   * goes true here and is reset on the next navigation.
   */
  useEffect(() => {
    if (!pending) return;
    const fuse = setTimeout(() => setDegraded(true), SCRIM_MS);
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
      showTimer.current = setTimeout(() => {
        // Both, together. A previous navigation that ran out its give-up timer
        // without the URL ever changing leaves `degraded` true and `pending`
        // false — the render-time reset above only fires on a route change, so
        // it would not have cleared it. Without this the next slow navigation
        // opens as a corner chip and never shows the scrim at all.
        setDegraded(false);
        setPending(true);
      }, SHOW_AFTER_MS);
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

  /**
   * The failure shape: a chip in the bottom-left, no scrim.
   *
   * Reached once SCRIM_MS has passed and the navigation still has not landed —
   * which, past a second and a half, usually means it is not going to. The
   * page underneath becomes readable again and the shopper keeps every link,
   * the header and the back button, while a small mark still says the click
   * was heard.
   *
   * ── Bottom-LEFT, and every other side is spoken for ────────────────────
   * Under the header dropped a white box over the middle of a full-bleed
   * hero — the one place guaranteed to be someone's face. Bottom-right is the
   * Toaster. Bottom-centre is the mobile sticky action bar on product and cart
   * pages. That leaves bottom-left, and the raised `bottom-28` below sm is
   * what clears that bar on phones: STICKY_BAR_SPACER reserves 7rem for it, so
   * this sits just above.
   */
  if (degraded) {
    return (
      <div className="pointer-events-none fixed bottom-28 left-4 z-[60] animate-in fade-in duration-200 sm:bottom-6 sm:left-6">
        <span className="flex items-center justify-center border bg-background/95 px-4 py-2.5 shadow-sm backdrop-blur-sm">
          <BrandLoader size={26} />
        </span>
      </div>
    );
  }

  return (
    <div
      /**
       * A centred mark over a blurred page.
       *
       * ── This was a corner chip, and the reason it was is still true ──────
       * ⚠️  Read this before touching the timers above. A navigation that
       * never lands never changes the URL, so nothing takes the indicator
       * down but the give-up timer — and a full-bleed wash for that whole
       * window makes the shop look dead rather than busy. A stuck chip is an
       * artefact in a corner; a stuck scrim is an outage. The failure case is
       * not exotic either: any 500, any dropped connection, any route that
       * redirects to the page it was already on.
       *
       * That hazard is now answered directly rather than traded against: the
       * scrim is time-boxed to SCRIM_MS and steps down to the corner chip
       * above if the navigation has not landed. So the wash covers the common
       * case — a slow route that arrives within a second or so — and a
       * navigation that never arrives is never sat behind one.
       *
       * ── pointer-events-none, and it matters MORE here ────────────────────
       * An indicator, not a modal. If it does get stuck, every link, the
       * header and the back button underneath are still live — the shopper is
       * looking through a blur, not trapped behind it. This is the escape
       * hatch that makes a full-screen overlay defensible at all.
       *
       * ── backdrop-blur is the expensive part ──────────────────────────────
       * A full-viewport backdrop-filter is one of the heavier things a mobile
       * GPU can be asked for, and it is asked for at exactly the moment the
       * main thread is already busy committing a navigation. `backdrop-blur-sm`
       * rather than a heavier radius is deliberate: the cost scales with the
       * radius, and the job here is to push the page back, not to erase it.
       *
       * ── The fade is not decoration ───────────────────────────────────────
       * Mounting a full-screen blur instantly reads as a flash. 200ms in takes
       * that edge off; tw-animate-css's `animate-in fade-in` honours
       * prefers-reduced-motion on its own, and the mark inside stops pulsing
       * under it too (see .brand-loader-pulse).
       *
       * z-[60] clears the header (40) and Radix overlays (50), so a dialog
       * linking onward cannot paint over its own loader.
       */
      className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center bg-background/60 backdrop-blur-sm animate-in fade-in duration-200"
    >
      {/* ⚠️  The mark needs something solid behind it. It is a pale logo, it
          pulses down to 0.35 opacity, and the scrim is 60% white over a page
          that is already near-white — centred on the blur alone it was very
          nearly invisible, which is a loading indicator that does not indicate.
          The bordered panel is what the old corner chip used, and it is doing
          the same job here: giving the mark an edge to sit against. */}
      <span className="flex items-center justify-center border bg-background px-7 py-6 shadow-sm">
        <BrandLoader size={56} />
      </span>
    </div>
  );
}
