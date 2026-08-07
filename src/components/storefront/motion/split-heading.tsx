"use client";

import { useRef, type ReactNode } from "react";
import { gsap, useGSAP, SplitText, MOTION_QUERY } from "@/lib/gsap";

/**
 * Reveals a heading a line at a time, each line rising out of the one above.
 *
 * The mask is the whole trick: SplitText wraps each line in a clipping div, so
 * the line slides up from behind a hard edge rather than fading in mid-air.
 * It is the difference between a heading that arrives and text that appears.
 *
 * Two failure modes this has to avoid, and both are about fonts:
 *
 * 1. SplitText measures line breaks at the moment it runs. If the webfont has
 *    not swapped in yet, it splits the fallback's line breaks and the heading
 *    re-wraps underneath the animation. `document.fonts.ready` is awaited first.
 * 2. Split text is rebuilt DOM. `autoSplit` lets SplitText re-run itself on
 *    resize, and `onSplit` returning the tween is what lets it hand cleanup
 *    back to GSAP.
 *
 * Falls back to the plain heading whenever motion is not wanted — the split
 * never runs, so the markup a screen reader sees is the markup the server sent.
 */
export function SplitHeading({
  children,
  className = "",
  as: Tag = "h2",
}: {
  children: ReactNode;
  className?: string;
  as?: "h1" | "h2";
}) {
  const scope = useRef<HTMLHeadingElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      mm.add(MOTION_QUERY.all, () => {
        let split: SplitText | undefined;
        let cancelled = false;

        document.fonts.ready.then(() => {
          if (cancelled || !scope.current) return;

          split = SplitText.create(scope.current, {
            type: "lines",
            mask: "lines",
            autoSplit: true,
            linesClass: "overflow-hidden",
            onSplit: (self) =>
              gsap.from(self.lines, {
                yPercent: 100,
                opacity: 0,
                duration: 0.8,
                ease: "power4.out",
                stagger: 0.12,
                scrollTrigger: { trigger: scope.current, start: "top 88%", once: true },
              }),
          });
        });

        return () => {
          cancelled = true;
          // Restores the original markup, which matters here: leaving a heading
          // as a pile of line divs would outlive this component.
          split?.revert();
        };
      });

      return () => mm.revert();
    },
    { scope },
  );

  return (
    <Tag ref={scope} className={className}>
      {children}
    </Tag>
  );
}
