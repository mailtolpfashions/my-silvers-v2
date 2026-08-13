"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Reveals content as it enters the viewport.
 *
 * Two modes, and the difference is what gets observed:
 *
 *   default   — the whole block fades up as ONE object. Right for an editorial
 *               section, a story, a band of copy.
 *   stagger   — each CHILD rises on its own as it reaches the fold. Right for a
 *               grid, where a single sheet arriving reads as a page load rather
 *               than as products appearing.
 *
 * The motion itself is CSS in globals.css (`.reveal-section` / `.reveal-stagger`);
 * all this does is add a class at the right moment, then stop watching. Nothing
 * re-animates on the way back up — a page that replays itself on every scroll
 * cannot sit still.
 *
 * A client component by necessity, but a thin one: `children` stays a server
 * component, so wrapping a grid costs a ref and an observer, not the grid's
 * markup moving to the client.
 *
 * Note for anything rendered inside Suspense — which under Cache Components is
 * most of the storefront: the observer is created when this mounts, and this
 * mounts with the streamed content, so a section that arrives late still gets
 * observed at the right moment. That is the reason to prefer this over a
 * scroll-position library, which measures the document once and has to be told
 * when it changed.
 */
export function RevealSection({
  children,
  className = "",
  /** Distance the content starts below its resting position. */
  offset,
  as: Tag = "section",
  /**
   * Reveal each child separately rather than the block as a whole.
   *
   * Use for grids. The cascade across a row is CSS (`nth-child`), so there is
   * nothing to pass per card — see the .reveal-stagger note in globals.css.
   */
  stagger = false,
}: {
  children: ReactNode;
  className?: string;
  offset?: number;
  /** `div` where a <section> would be wrong for the document outline. */
  as?: "section" | "div";
  stagger?: boolean;
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add(stagger ? "reveal-item-visible" : "reveal-visible");
          observer.unobserve(entry.target);
        }
      },
      // A shallow threshold with a small negative bottom margin: content starts
      // moving as its top edge clears the fold, rather than waiting for a tenth
      // of a tall section to be on screen.
      { threshold: 0.08, rootMargin: "0px 0px -32px 0px" },
    );

    if (!stagger) {
      observer.observe(el);
      return () => observer.disconnect();
    }

    for (const child of Array.from(el.children)) observer.observe(child);

    /**
     * ⚠️  Watch for children appended after mount, or they stay invisible.
     *
     * The catalogue grid is an infinite list — product-grid.tsx appends a batch
     * every time its sentinel fires. Those cards render into a container whose
     * `.reveal-stagger > *` rule has already set them to `opacity: 0`, and with
     * nothing observing them nothing would ever take it off. Without this the
     * second page of every listing is blank space.
     */
    const appended = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of Array.from(mutation.addedNodes)) {
          if (node instanceof Element) observer.observe(node);
        }
      }
    });
    appended.observe(el, { childList: true });

    return () => {
      observer.disconnect();
      appended.disconnect();
    };
  }, [stagger]);

  return (
    <Tag
      ref={ref as React.Ref<HTMLElement & HTMLDivElement>}
      className={`${stagger ? "reveal-stagger" : "reveal-section"} ${className}`}
      style={offset !== undefined ? ({ "--reveal-offset": `${offset}px` } as React.CSSProperties) : undefined}
    >
      {children}
    </Tag>
  );
}
