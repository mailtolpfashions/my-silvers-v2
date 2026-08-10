"use client";

import { createContext, useContext, useId, useState } from "react";
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
   * already flagged itself.
   */
  requireSize: () => string | null;
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

  function requireSize(): string | null {
    if (sizes.length === 0) return "";
    if (!selected) {
      setMissing(true);
      return null;
    }
    return selected;
  }

  return (
    <SizeContext.Provider
      value={{ sizes, stockBySize, selected, setSelected, missing, setMissing, requireSize }}
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
    }
  );
}

/** The size chips. Renders nothing for a product with no sizes. */
export function SizeSelector({ sizeGuideHref }: { sizeGuideHref?: string }) {
  const { sizes, stockBySize, selected, setSelected, missing, setMissing } = useSize();
  const labelId = useId();
  const errorId = useId();

  if (sizes.length === 0) return null;

  return (
    <div className="mt-6">
      <div className="mb-2.5 flex items-center justify-between">
        <p id={labelId} className="text-sm font-medium">
          Size{selected && <span className="text-muted-foreground"> · {selected}</span>}
        </p>
        {/* Ring sizing is the single biggest reason a silver order comes back,
            so this is the one secondary link on the page worth making obvious.
            It was a faint brass word that read as body copy. */}
        {sizeGuideHref && (
          <a
            href={sizeGuideHref}
            className="inline-flex items-center gap-1.5 border-b border-foreground pb-0.5 text-sm transition-colors hover:border-brass hover:text-brass-text"
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
              className={`min-w-11 border px-3.5 py-2 text-sm transition-colors sm:min-w-12 sm:px-4 sm:py-2.5 ${
                soldOut
                  ? "cursor-not-allowed border-input/60 text-muted-foreground/60 line-through"
                  : active
                    ? "border-foreground bg-foreground text-background"
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
