"use client";

import { useRef, type ReactNode } from "react";
import { gsap, useGSAP, ScrollTrigger, MOTION_QUERY } from "@/lib/gsap";

/**
 * Brings a grid's cards in a few at a time as the grid enters the viewport.
 *
 * `ScrollTrigger.batch` rather than one trigger per card with a stagger: batch
 * groups everything that crossed the line within the same frame and animates
 * that group together, so a row arriving as a row animates as a row. A plain
 * stagger over the whole grid would instead start counting from the first card
 * regardless of what is actually on screen, and by the fourth row the delay has
 * accumulated into a visible wait.
 *
 * Takes its cards as `children`, so ProductCard stays a server component and
 * listing pages stay cacheable — this wrapper adds a ref and nothing else to
 * the tree.
 *
 * The direct children of this element are the cards, so `> *` is the selector
 * rather than anything card-specific. That keeps it usable for the collection
 * grid and the category tiles too.
 */
export function StaggerGrid({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const scope = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      mm.add(MOTION_QUERY.all, () => {
        const cards = scope.current?.children;
        if (!cards?.length) return;

        // Set the from-state explicitly instead of using gsap.from: batch's
        // onEnter fires per group, and a `from` tween would re-read the current
        // value each time and animate from wherever the card already was.
        gsap.set(cards, { opacity: 0, y: 28 });

        const triggers = ScrollTrigger.batch(cards, {
          start: "top 92%",
          once: true,
          // A quarter-second window: wide enough to collect a full row on a
          // fast scroll, short enough that a slow one still feels responsive.
          interval: 0.25,
          // Four is the widest this grid ever gets, so a batch is at most one
          // visual row and the stagger reads left to right.
          batchMax: 4,
          onEnter: (batch) =>
            gsap.to(batch, {
              opacity: 1,
              y: 0,
              duration: 0.6,
              ease: "power3.out",
              stagger: 0.08,
              overwrite: true,
            }),
        });

        return () => triggers.forEach((trigger) => trigger.kill());
      });

      return () => mm.revert();
    },
    { scope },
  );

  return (
    <div ref={scope} className={className}>
      {children}
    </div>
  );
}
