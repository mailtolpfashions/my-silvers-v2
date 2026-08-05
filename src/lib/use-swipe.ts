"use client";

import { useRef } from "react";

/** Horizontal travel, in px, that counts as a swipe rather than a tap. */
const SWIPE_MIN = 45;
/** Travel after which the gesture is committed to horizontal, not vertical. */
const SWIPE_LOCK = 12;

/**
 * Touch swipe between slides.
 *
 * Shared by the hero carousel and the product gallery — they had the same
 * gesture and the same two traps, so the logic lives in one place.
 *
 * Trap one: a page scrolled with a finger is rarely perfectly vertical, so a
 * handler that reacts to any horizontal movement flicks the slide while someone
 * is trying to scroll past it. The gesture is only claimed once it is clearly
 * sideways — past SWIPE_LOCK and more sideways than down.
 *
 * Trap two: `click` fires after `touchend`, so a swipe that happens to finish
 * over a link would follow it. `didSwipe` records the gesture; callers check it
 * in an onClickCapture handler and cancel.
 *
 * Refs throughout, not state: nothing here should re-render mid-gesture, and the
 * click handler must read the final value synchronously — a state update would
 * not have landed in time.
 */
export function useSwipe({ onPrev, onNext }: { onPrev?: () => void; onNext?: () => void }) {
  const start = useRef<{ x: number; y: number; horizontal: boolean } | null>(null);
  const didSwipe = useRef(false);

  const enabled = Boolean(onPrev || onNext);

  function onTouchStart(event: React.TouchEvent) {
    if (!enabled) return;
    const t = event.touches[0];
    start.current = { x: t.clientX, y: t.clientY, horizontal: false };
    didSwipe.current = false;
  }

  function onTouchMove(event: React.TouchEvent) {
    const from = start.current;
    if (!from) return;
    const t = event.touches[0];
    const dx = t.clientX - from.x;
    const dy = t.clientY - from.y;
    if (!from.horizontal && Math.abs(dx) > SWIPE_LOCK && Math.abs(dx) > Math.abs(dy)) {
      from.horizontal = true;
    }
  }

  function onTouchEnd(event: React.TouchEvent) {
    const from = start.current;
    start.current = null;
    if (!from?.horizontal) return;

    const dx = event.changedTouches[0].clientX - from.x;
    if (Math.abs(dx) < SWIPE_MIN) return;

    didSwipe.current = true;
    if (dx < 0) onNext?.();
    else onPrev?.();
  }

  /**
   * True exactly once after a swipe, then false again.
   *
   * A function rather than the raw ref: the caller has to clear the flag, and
   * reaching into another hook's ref to do it is both a lint error and the
   * kind of coupling that rots. Ownership stays here.
   */
  function consumeSwipe(): boolean {
    if (!didSwipe.current) return false;
    didSwipe.current = false;
    return true;
  }

  /**
   * Attach to the same element in onClickCapture. Swallows exactly one click —
   * the one the browser fires after a swipe — so a gesture that ends on a link
   * or button does not also activate it.
   */
  function cancelClickAfterSwipe(event: React.MouseEvent) {
    if (!consumeSwipe()) return;
    event.preventDefault();
    event.stopPropagation();
  }

  return {
    /** Spread onto the swipeable element. */
    handlers: { onTouchStart, onTouchMove, onTouchEnd },
    consumeSwipe,
    cancelClickAfterSwipe,
  };
}
