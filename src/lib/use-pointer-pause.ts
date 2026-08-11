"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * A short, self-clearing pause for an autoplaying carousel.
 *
 * Both carousels on this site used to hold for as long as the pointer was over
 * them, which meant a shopper who left the cursor anywhere near the hero never
 * saw a second slide. This is the replacement: an interaction pauses the
 * rotation briefly and it then resumes on its own, whether or not the pointer
 * is still there.
 *
 * ── This deliberately does NOT cover keyboard focus ──────────────────────────
 * Focus should hold indefinitely, and each carousel wires that separately. The
 * two are not the same event: a pointer resting over a hero is usually the
 * mouse simply being somewhere, while focus inside one means a keyboard user is
 * working through its links and cannot be expected to read against a timer.
 * WCAG 2.2.2 wants moving content to be stoppable; the timed resume here is a
 * pointer convenience, not the accessibility mechanism.
 *
 * Every call to `nudge` restarts the clock, so continuous movement over a rail
 * keeps deferring the resume rather than letting it fire mid-gesture.
 */
export function usePointerPause(durationMs: number) {
  const [paused, setPaused] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const nudge = useCallback(() => {
    setPaused(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setPaused(false), durationMs);
  }, [durationMs]);

  // A pending timer that fires after unmount would set state on a dead
  // component; clearing on teardown is what keeps this safe in a streamed tree
  // where sections mount and unmount as they resolve.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return { paused, nudge };
}
