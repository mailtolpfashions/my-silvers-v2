"use client";

import { useRef, type ReactNode } from "react";
import { gsap, useGSAP, MOTION_QUERY } from "@/lib/gsap";

/**
 * The section-entry animation: a fade and a short rise, optionally staggered
 * across the section's children.
 *
 * Supersedes the CSS `.reveal-section` for sections that want stagger or a
 * longer travel. The CSS one stays for everything else — it is 0.5KB and works
 * without JavaScript, and there is no reason to spend a ScrollTrigger on a
 * plain fade.
 *
 * Short distances and slow eases on purpose. The tell of an amateur scroll
 * animation is 80px of travel with a bouncy ease; the tell of an expensive one
 * is 24px with `power3.out` and a beat of stagger between children.
 */
export function GsapReveal({
  children,
  className = "",
  /** Selector for children to stagger, relative to this section. */
  stagger,
  /** Travel distance in px. */
  y = 24,
  as: Tag = "section",
}: {
  children: ReactNode;
  className?: string;
  stagger?: string;
  y?: number;
  as?: "section" | "div";
}) {
  const scope = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      // Only inside matchMedia: when the query does not match, GSAP never sets
      // the `from` state, so the section renders exactly as the server sent it.
      // This is what keeps reduced-motion visitors from seeing opacity: 0.
      mm.add(MOTION_QUERY.all, () => {
        const targets =
          stagger && scope.current?.querySelectorAll(stagger).length
            ? scope.current.querySelectorAll(stagger)
            : scope.current;
        if (!targets) return;

        gsap.from(targets, {
          opacity: 0,
          y,
          duration: 0.7,
          ease: "power3.out",
          stagger: stagger ? 0.08 : 0,
          scrollTrigger: {
            trigger: scope.current,
            // Starts as the section's top clears the fold, so the motion is
            // finishing by the time it is properly in view rather than
            // beginning once the reader is already looking at it.
            start: "top 85%",
            once: true,
          },
        });
      });

      return () => mm.revert();
    },
    { scope },
  );

  return (
    <Tag ref={scope as React.Ref<HTMLElement & HTMLDivElement>} className={className}>
      {children}
    </Tag>
  );
}
