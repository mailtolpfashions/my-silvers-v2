"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Fades a section up as it enters the viewport.
 *
 * Ported from the previous storefront, thresholds included. The motion itself
 * is CSS (see .reveal-section in globals.css); all this does is add the class
 * once, then stop observing — a section that has arrived never needs watching
 * again, and re-animating on the way back up reads as a page that can't sit
 * still.
 *
 * A client component by necessity, but a thin one: `children` stays a server
 * component, so wrapping a section costs a ref and an observer, not the
 * section's markup moving to the client.
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
  /** Distance the section starts below its resting position. */
  offset = 20,
  as: Tag = "section",
}: {
  children: ReactNode;
  className?: string;
  offset?: number;
  /** `div` where a <section> would be wrong for the document outline. */
  as?: "section" | "div";
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        el.classList.add("reveal-visible");
        observer.unobserve(el);
      },
      // A shallow threshold with a small negative bottom margin: the section
      // starts moving as its top edge clears the fold, rather than waiting for
      // a tenth of a tall section to be on screen.
      { threshold: 0.08, rootMargin: "0px 0px -32px 0px" },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag
      ref={ref as React.Ref<HTMLElement & HTMLDivElement>}
      className={`reveal-section ${className}`}
      style={{ "--reveal-offset": `${offset}px` } as React.CSSProperties}
    >
      {children}
    </Tag>
  );
}
