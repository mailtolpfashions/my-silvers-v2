"use client";

import { useEffect, useState } from "react";

/**
 * The pinned frame of the phone's bottom action bar, which steps aside once
 * the page's footer comes into view.
 *
 * The bar exists so the main action (Add to cart, Filter, Checkout…) is one
 * tap away while the shopper is looking at the product or list. Once they have
 * scrolled past all of that into the footer, it has done its job — and it was
 * sitting over the footer's own links and the legal line (owner's report,
 * Nov 2026: "can we stick those buttons up to the product page?"). So it slides
 * down out of view while the footer is on screen, and back up the moment they
 * scroll up into the page again.
 *
 * Hidden means hidden for everyone: `inert` takes it out of the tab order and
 * the accessibility tree while it is off screen.
 */
export function StickyBarFrame({
  children,
  stayOverFooter = false,
}: {
  children: React.ReactNode;
  /**
   * Never step aside. For the cart and checkout, where this bar holds the ONLY
   * button on a phone (the in-page one is md:inline-flex) — hiding it at the
   * footer would leave a shopper at the bottom of checkout with nothing to
   * press. The shell reserves room at the end of the page instead
   * ([data-sticky-action-bar="pinned"] in globals.css).
   */
  stayOverFooter?: boolean;
}) {
  const [footerInView, setFooterInView] = useState(false);

  useEffect(() => {
    if (stayOverFooter) return;
    const footer = document.querySelector("footer");
    if (!footer || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setFooterInView(entry.isIntersecting), {
      // Step aside a little before the footer arrives, so the two never overlap.
      rootMargin: "0px 0px 80px 0px",
    });
    observer.observe(footer);
    return () => observer.disconnect();
  }, [stayOverFooter]);

  return (
    <div
      data-sticky-action-bar={stayOverFooter ? "pinned" : "steps-aside"}
      inert={footerInView}
      aria-hidden={footerInView || undefined}
      // z-40 matches the header rather than exceeding it: a drawer or dialog
      // (z-50) must still cover this. Solid, not frosted: at 80% opacity the
      // dark footer showed through as a muddy grey.
      className={`fixed inset-x-0 bottom-0 z-40 border-t bg-background transition-transform duration-300 ease-out motion-reduce:transition-none md:hidden ${
        footerInView ? "translate-y-full" : "translate-y-0"
      }`}
      // The iPhone home indicator and Android's gesture pill both sit over the
      // bottom of the viewport. Without this the buttons are under them and the
      // last few pixels are unreachable. Reads 0 on hardware that has neither —
      // but only because the root layout sets viewport-fit: cover, which is
      // what makes env() report anything at all.
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {children}
    </div>
  );
}
