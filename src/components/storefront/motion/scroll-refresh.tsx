"use client";

import { useEffect } from "react";
import { ScrollTrigger } from "@/lib/gsap";

/**
 * Recomputes every trigger's start/end when the page gets taller.
 *
 * Not optional on this site. ScrollTrigger measures the document once, at
 * creation, and refreshes itself only on viewport resize. Under Cache
 * Components almost every page here commits a static shell first and streams
 * its sections in afterwards — recommendation rows, reviews, the Instagram
 * feed — so a trigger created during the shell has measured a document that is
 * still several thousand pixels short of its final height. Left alone, the
 * symptom is animations that fire at visibly the wrong moment, or never.
 *
 * A ResizeObserver on <body> catches all of it: streamed sections, images
 * settling into their aspect boxes, and fonts swapping in. Debounced because
 * refresh() re-measures every trigger on the page and streaming fires this in
 * bursts.
 */
export function ScrollRefresh() {
  useEffect(() => {
    let frame = 0;
    let lastHeight = document.body.offsetHeight;

    const observer = new ResizeObserver(() => {
      const height = document.body.offsetHeight;
      // Width-only changes are ScrollTrigger's own business — it already
      // handles viewport resize, and refreshing twice for one resize is waste.
      if (height === lastHeight) return;
      lastHeight = height;

      window.clearTimeout(frame);
      frame = window.setTimeout(() => ScrollTrigger.refresh(), 150);
    });

    observer.observe(document.body);
    return () => {
      observer.disconnect();
      window.clearTimeout(frame);
    };
  }, []);

  return null;
}
