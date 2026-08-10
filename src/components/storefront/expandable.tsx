"use client";

import { useId, useState } from "react";
import { Minus, Plus } from "lucide-react";

/**
 * A hairline-separated expandable row.
 *
 * Deliberately hand-rolled rather than Radix Accordion: this needs exactly one
 * behaviour — a button that toggles a region — and the primitive would add a
 * dependency, a context and a set of data-state selectors to style around for
 * no capability this uses. It is also deliberately NOT <details>/<summary>,
 * whose open/close cannot be animated consistently across browsers and whose
 * marker is a fight to remove.
 *
 * Independent rather than a single-open group. Someone comparing measurements
 * against the care instructions should not have one close because they opened
 * the other.
 *
 * The panel is unmounted when closed rather than hidden. These sections hold
 * CMS rich text of unknown length, and a collapsed-but-present panel inside a
 * `max-h-0 overflow-hidden` wrapper is the classic way to leave links focusable
 * and readable to a screen reader while invisible to everyone else.
 */
export function Expandable({
  title,
  children,
  /** Open on first paint. Used for the row a shopper most often wants. */
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();
  const buttonId = useId();

  return (
    <div className="border-b">
      <h3>
        <button
          type="button"
          id={buttonId}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-4 py-4 text-left text-sm font-medium transition-colors hover:text-brass-text"
        >
          {title}
          {open ? (
            <Minus className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          ) : (
            <Plus className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          )}
        </button>
      </h3>

      {open && (
        <div
          id={panelId}
          role="region"
          aria-labelledby={buttonId}
          className="pb-5 text-sm leading-relaxed text-muted-foreground"
        >
          {children}
        </div>
      )}
    </div>
  );
}
