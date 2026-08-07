"use client";

import { useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { gsap, useGSAP, MOTION_QUERY } from "@/lib/gsap";

/**
 * The homepage's one pinned moment: a full-bleed photograph held under the
 * viewport while its copy advances through stages.
 *
 * This is the apple.com move, and the reason it works there is restraint —
 * one held image, a few short lines, and nothing else competing. Used more than
 * once on a page it stops being a moment and becomes an obstacle between the
 * shopper and the products.
 *
 * Desktop only. Pinning on a phone means fighting the browser's address bar,
 * which resizes the viewport mid-scroll and makes the pin visibly jump; below
 * lg this renders as a plain image with all its copy at once, which is a
 * perfectly good section in its own right.
 */
export function PinnedStory({
  title,
  eyebrow,
  stages,
  image,
  ctaLabel,
  ctaHref,
}: {
  title: string;
  eyebrow?: string;
  stages: string[];
  image: string;
  ctaLabel?: string;
  ctaHref?: string;
}) {
  const scope = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      mm.add(MOTION_QUERY.desktop, () => {
        const stageEls = gsap.utils.toArray<HTMLElement>("[data-stage]", scope.current);
        if (stageEls.length === 0) return;

        // Pin for a stage's worth of scroll each, so adding a stage in the CMS
        // lengthens the section instead of speeding up the ones already there.
        const timeline = gsap.timeline({
          scrollTrigger: {
            trigger: scope.current,
            start: "top top",
            end: () => `+=${stageEls.length * 60}%`,
            pin: true,
            scrub: 1,
            // Fixed rather than transform: the atmosphere overlays and sticky
            // bars are position: fixed, and transform pinning would reparent
            // this section into a new containing block and drag them with it.
            pinType: "fixed",
            anticipatePin: 1,
          },
        });

        // The image drifts and lifts across the whole pin. Small numbers: the
        // photograph is held, and a held image that visibly zooms reads as a
        // slideshow effect rather than depth.
        timeline.fromTo(
          "[data-story-image]",
          { scale: 1.06, yPercent: -2 },
          { scale: 1, yPercent: 2, ease: "none" },
          0,
        );

        // Each stage fades up, holds, and leaves — except the last, which stays
        // so the section does not end on empty space.
        stageEls.forEach((stage, index) => {
          const at = index * 1;
          timeline.fromTo(
            stage,
            { autoAlpha: 0, y: 28 },
            { autoAlpha: 1, y: 0, duration: 0.35, ease: "power2.out" },
            at,
          );
          if (index < stageEls.length - 1) {
            timeline.to(stage, { autoAlpha: 0, y: -28, duration: 0.35, ease: "power2.in" }, at + 0.65);
          }
        });
      });

      return () => mm.revert();
    },
    { scope, dependencies: [stages.length] },
  );

  return (
    <section ref={scope} className="relative overflow-hidden lg:h-screen">
      <div data-story-image className="absolute inset-0">
        <Image src={image} alt="" fill className="object-cover object-center" sizes="100vw" />
      </div>

      {/* Scrim heavy enough to carry white text over an arbitrary uploaded
          photograph — the same problem the category banner solves. */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to top, rgba(12,12,14,0.75) 0%, rgba(12,12,14,0.35) 55%, rgba(12,12,14,0.15) 100%)",
        }}
      />

      <div className="container-page relative flex min-h-[70vh] items-center py-20 lg:h-full">
        <div className="max-w-xl">
          {eyebrow && <p className="label-eyebrow label-eyebrow-light mb-4">{eyebrow}</p>}
          {/* text-white spelled out: the base layer colours every heading
              directly, and a direct rule beats the inherited one. Same trap as
              the hero carousel. */}
          <h2 className="text-h2 font-heading text-white">{title}</h2>

          {/* Below lg every stage is simply visible, stacked. The pin is an
              enhancement on top of a section that already reads without it. */}
          <div className="mt-6 space-y-4 lg:relative lg:mt-8 lg:min-h-[9rem] lg:space-y-0">
            {stages.map((stage, i) => (
              <p
                key={i}
                data-stage
                className="text-lead text-white/85 lg:absolute lg:inset-x-0 lg:top-0"
              >
                {stage}
              </p>
            ))}
          </div>

          {ctaLabel && ctaHref && (
            <Button asChild size="lg" className="mt-8 h-12 rounded-full px-8">
              <Link href={ctaHref}>{ctaLabel}</Link>
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
