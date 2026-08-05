"use client";

import { useEffect, useState } from "react";

/** How long each message holds before the next one takes its place. */
const ROTATE_MS = 4500;

/** Shape supplied by getLiveAnnouncements — tone is used by the bar, not here. */
type AnnouncementItem = { id: string; text: string };

/**
 * Rotates the announcement bar through every live message, one at a time.
 *
 * One line, always. The bar used to render text and subtext side by side, which
 * on a phone was ~68 characters in a space that fits about 40 — so the second
 * half was simply cut off. They are separate lines in the rotation now; see
 * getLiveAnnouncements. `truncate` stays as the backstop for a single message
 * an editor makes too long.
 *
 * Only the TEXT rotates; the bar keeps one tone. Cycling the background colour
 * as well would flash the top of the page every few seconds, and a colour that
 * changes on a timer stops meaning anything.
 */
export function AnnouncementTicker({
  items,
  className,
}: {
  items: AnnouncementItem[];
  className?: string;
}) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (items.length <= 1) return;
    // Auto-advancing content is a known accessibility trigger, and WCAG 2.2.2
    // requires a way to stop it. With no controls here, the honest answer is
    // not to move at all — the first message simply stays.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const timer = setInterval(() => setIndex((i) => (i + 1) % items.length), ROTATE_MS);
    return () => clearInterval(timer);
  }, [items.length]);

  if (items.length === 0) return null;

  // Modulo guards against an editor unpublishing a message while the index is
  // past the new end, which would otherwise blank the bar until the next tick.
  const item = items[index % items.length];

  return (
    <div className={`px-4 py-2 text-center text-sm ${className ?? ""}`}>
      {/* aria-live so a screen reader announces a message that appears without
          the user doing anything — but "polite", so it waits its turn rather
          than interrupting whatever is being read. */}
      <p aria-live="polite" aria-atomic className="truncate">
        {/* Remounting on change replays the fade. */}
        <span
          key={item.id}
          className="font-medium animate-in fade-in duration-500 motion-reduce:animate-none"
        >
          {item.text}
        </span>
      </p>
    </div>
  );
}
