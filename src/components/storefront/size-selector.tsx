"use client";

import { createContext, useContext, useId, useRef, useState } from "react";
import { Ruler } from "lucide-react";

type SizeState = {
  sizes: string[];
  /** size -> units available. Missing entries are treated as in stock. */
  stockBySize: Record<string, number>;
  selected: string;
  setSelected: (size: string) => void;
  /** Set when the shopper tried to add without choosing. */
  missing: boolean;
  setMissing: (missing: boolean) => void;
  /**
   * Call before adding to the cart. Returns the size to send, or null when the
   * product needs one and none is chosen — in which case the selector has
   * already flagged itself AND scrolled into view.
   */
  requireSize: () => string | null;
  /** The selector's own element, so requireSize can bring it back on screen. */
  selectorRef: React.RefObject<HTMLDivElement | null>;
};

const SizeContext = createContext<SizeState | null>(null);

/**
 * Shares the chosen size between the selector and the Buy now / Add to cart
 * buttons, which are siblings rather than parent and child.
 *
 * Context rather than lifting state into the page because the page is a server
 * component — it cannot hold useState, and passing a setter down through it is
 * not possible.
 */
export function SizeProvider({
  sizes,
  stockBySize = {},
  children,
}: {
  sizes: string[];
  stockBySize?: Record<string, number>;
  children: React.ReactNode;
}) {
  const [selected, setSelected] = useState("");
  const [missing, setMissing] = useState(false);
  const selectorRef = useRef<HTMLDivElement>(null);

  function requireSize(): string | null {
    if (sizes.length === 0) return "";
    if (!selected) {
      setMissing(true);

      /**
       * ⚠️  Bring the selector back on screen, because the button that refused
       * is frequently nowhere near it.
       *
       * "Add to cart" and "Buy now" also live in the sticky bar at the bottom
       * of a phone screen, and on a long product page the shopper is usually
       * far below the size chips by the time they press one. Setting `missing`
       * alone rendered "Please choose a size first" into a part of the page
       * they could not see: the button simply did nothing, twice, and then they
       * left. This is the whole reason the ref exists.
       */
      selectorRef.current?.scrollIntoView({
        behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
        block: "center",
      });
      // Focus the first choosable chip, so the fix is one keypress away and a
      // screen reader is moved to the thing that needs answering. preventScroll
      // so it does not fight the smooth scroll above.
      selectorRef.current
        ?.querySelector<HTMLButtonElement>('button[role="radio"]:not([disabled])')
        ?.focus({ preventScroll: true });

      return null;
    }
    return selected;
  }

  return (
    <SizeContext.Provider
      value={{
        sizes,
        stockBySize,
        selected,
        setSelected,
        missing,
        setMissing,
        requireSize,
        selectorRef,
      }}
    >
      {children}
    </SizeContext.Provider>
  );
}

/**
 * Safe to call outside a provider — returns a state that requires no size, so
 * the cart buttons work unchanged on any page that has no selector.
 */
export function useSize(): SizeState {
  const context = useContext(SizeContext);
  return (
    context ?? {
      sizes: [],
      stockBySize: {},
      selected: "",
      setSelected: () => {},
      missing: false,
      setMissing: () => {},
      requireSize: () => "",
      selectorRef: { current: null },
    }
  );
}

/** The size chips. Renders nothing for a product with no sizes. */
export function SizeSelector({ sizeGuideHref }: { sizeGuideHref?: string }) {
  const { sizes, stockBySize, selected, setSelected, missing, setMissing, selectorRef } = useSize();
  const labelId = useId();
  const errorId = useId();

  if (sizes.length === 0) return null;

  return (
    // scroll-mt so that if anything ever scrolls to this by hash or anchor it
    // clears the sticky header. requireSize uses block:"center" and does not
    // depend on it.
    <div ref={selectorRef} className="mt-6 scroll-mt-24">
      <div className="mb-2.5 flex items-center justify-between">
        <p id={labelId} className="text-sm font-medium">
          Size{selected && <span className="text-muted-foreground"> · {selected}</span>}
        </p>
        {/* Ring sizing is the single biggest reason a silver order comes back,
            so this is the one secondary link on the page worth making obvious.
            It was a faint black word that read as body copy. */}
        {sizeGuideHref && (
          <a
            href={sizeGuideHref}
            className="inline-flex items-center gap-1.5 border-b border-foreground pb-0.5 text-sm transition-colors hover:border-black hover:text-black"
          >
            <Ruler className="size-3.5" aria-hidden />
            Find your size
          </a>
        )}
      </div>

      {/* radiogroup, not a listbox: exactly one value, chosen from a small
          visible set. Arrow keys move between options for free. */}
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        aria-describedby={missing ? errorId : undefined}
        aria-required
        aria-invalid={missing}
        className="flex flex-wrap gap-2"
      >
        {sizes.map((size) => {
          const active = size === selected;
          // Absent from the map means "no per-size record", which is treated as
          // available — an unsized legacy row must not disable every chip.
          const soldOut = (stockBySize[size] ?? 1) <= 0;
          return (
            <button
              key={size}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={soldOut}
              // Rendered but struck through rather than hidden: a shopper
              // looking for their size needs to see it was offered and is gone,
              // not silently find it missing.
              aria-label={soldOut ? `Size ${size} — out of stock` : undefined}
              onClick={() => {
                setSelected(size);
                setMissing(false);
              }}
              /**
               * When a purchase has been refused for want of a size, the CHIPS
               * turn red — not only the sentence beneath them. A red line of
               * text under an unchanged row of buttons tells a shopper that
               * something is wrong without showing them what to press; the
               * control that needs answering should be the thing that looks
               * answerable.
               *
               * Sold-out chips stay grey. Colouring one red would read as "this
               * is the problem", when the problem is that a DIFFERENT chip has
               * not been chosen.
               */
              className={`min-w-11 border px-3.5 py-2 text-sm transition-colors sm:min-w-12 sm:px-4 sm:py-2.5 ${
                soldOut
                  ? "cursor-not-allowed border-input/60 text-muted-foreground/60 line-through"
                  : active
                    ? "border-foreground bg-foreground text-background"
                    : missing
                      ? "border-destructive text-destructive hover:border-foreground hover:text-foreground"
                      : "border-input hover:border-foreground"
              }`}
            >
              {size}
            </button>
          );
        })}
      </div>

      {missing && (
        <p id={errorId} role="alert" className="mt-2 text-sm font-medium text-destructive">
          Please choose a size first.
        </p>
      )}
    </div>
  );
}
