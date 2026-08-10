"use client";

import { useEffect, useState } from "react";

/**
 * How far the page must move before the header commits to its solid state.
 *
 * Small on purpose. This is not "past the hero" — it is "the shopper has begun
 * to scroll", which is the moment the header stops being part of the hero
 * composition and starts being chrome that has to stay readable over whatever
 * is passing underneath it.
 */
const SCROLL_THRESHOLD = 24;

/**
 * The header's outer element, and the one piece of it that has to be a client
 * component.
 *
 * ── What this owns, and what it deliberately does not ────────────────────────
 * It owns ONE bit of state: has the page scrolled. Everything else about the
 * transparent-over-hero treatment — whether this page even has a full-bleed
 * hero, and the hover/focus states that bring the solid background back — is
 * decided in CSS, in the `.site-header` block in globals.css.
 *
 * That split is the point:
 *
 *  - WHICH PAGES OVERLAY is answered by `:has([data-hero-full])` on the
 *    storefront shell. A CSS selector is evaluated during the first paint, so a
 *    hard reload on the homepage renders the transparent header immediately.
 *    Reading the DOM from an effect here would paint the solid header first and
 *    then swap it, which is a visible flash on exactly the page that matters
 *    most.
 *  - HOVER AND FOCUS are `:hover` / `:focus-within`. Doing those in React would
 *    mean mouseenter/mouseleave/focus/blur handlers and four more re-renders
 *    per pass for something the browser already tracks for free — and
 *    `:focus-within` in particular is fiddly to reproduce correctly with
 *    relatedTarget checks (see the mega menu, which has to do it because it
 *    also needs timers).
 *
 * So the only thing JavaScript is genuinely required for is scroll position.
 *
 * `children` is the server-rendered header content, passed through untouched —
 * the utility bar, nav and account cluster all stay server components, so
 * nothing about the catalogue or the session is pulled into the client bundle
 * by this wrapper.
 */
export function HeaderChrome({ children }: { children: React.ReactNode }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    let frame = 0;

    const read = () => {
      frame = 0;
      // Compared against a boolean, so React bails out of the re-render on
      // every scroll event except the two that actually cross the threshold.
      setScrolled(window.scrollY > SCROLL_THRESHOLD);
    };

    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(read);
    };

    // Once on mount: a reload restores the previous scroll position, and a
    // header that starts transparent halfway down the page is unreadable.
    read();

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <header
      // `sticky` here is the default; the CSS promotes it to `fixed` on pages
      // that opt into the overlay. Both are positioned, so the mega panel's
      // `absolute top-full` still measures from the header either way.
      className="site-header sticky top-0 z-40"
      // Absent rather than "false" when at the top, so the CSS can key off
      // `:not([data-scrolled])` instead of an attribute-value match.
      data-scrolled={scrolled || undefined}
      // Named so view transitions can hold it still while the page slides
      // underneath — see ::view-transition-group(site-header) in globals.css.
      // A header that moves with the content destroys the user's spatial
      // anchor and makes the direction cue unreadable. Do not remove.
      style={{ viewTransitionName: "site-header" }}
    >
      {children}
    </header>
  );
}
