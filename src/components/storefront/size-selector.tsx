"use client";

import { createContext, useContext, useId, useState } from "react";

type SizeState = {
  sizes: string[];
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
  children,
}: {
  sizes: string[];
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
      value={{ sizes, selected, setSelected, missing, setMissing, requireSize }}
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
  const { sizes, selected, setSelected, missing, setMissing } = useSize();
  const labelId = useId();
  const errorId = useId();

  if (sizes.length === 0) return null;

  return (
    <div className="mt-6">
      <div className="mb-2.5 flex items-center justify-between">
        <p id={labelId} className="text-sm font-medium">
          Size{selected && <span className="text-muted-foreground"> · {selected}</span>}
        </p>
        {sizeGuideHref && (
          <a
            href={sizeGuideHref}
            className="text-sm text-brass-text underline underline-offset-4"
          >
            Size guide
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
          return (
            <button
              key={size}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => {
                setSelected(size);
                setMissing(false);
              }}
              className={`min-w-12 rounded-full border px-4 py-2.5 text-base transition-colors ${
                active
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
