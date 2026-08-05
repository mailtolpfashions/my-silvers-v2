"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Clock, Search, TrendingUp, X } from "lucide-react";
import {
  clearRecentSearches,
  getRecentSearchesServerSnapshot,
  getRecentSearchesSnapshot,
  recordSearch,
  subscribeRecentSearches,
} from "@/lib/recent-searches";
import type { SearchTerm } from "@/server/products/search-terms";

type Suggestion = {
  products: Array<{ id: string; name: string; slug: string; image: string | null; price: string }>;
  categories: Array<{ name: string; slug: string }>;
};

const EMPTY: Suggestion = { products: [], categories: [] };
const DEBOUNCE_MS = 200;

/** Last resort only — an empty catalogue AND no CMS override. */
const DEFAULT_PLACEHOLDER = "Search for rings, earrings, anklets…";
const ROTATE_MS = 3000;

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

export function SearchBox({
  className = "",
  placeholders,
  popular = [],
}: {
  className?: string;
  /** Derived from the catalogue, or the CMS override. Cycled one at a time. */
  placeholders?: string[];
  /** Chips shown under an idle field, before anything is typed. */
  popular?: SearchTerm[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Suggestion>(EMPTY);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [focused, setFocused] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listId = useId();

  // useSyncExternalStore rather than useEffect+setState: localStorage is
  // external state, and reading it in an effect would render an empty list
  // first and then swap it in, which lint rejects here for good reason.
  const recent = useSyncExternalStore(
    subscribeRecentSearches,
    getRecentSearchesSnapshot,
    getRecentSearchesServerSnapshot,
  );

  const terms = placeholders?.filter((t) => t.trim().length > 0) ?? [];

  // Rotates the placeholder, but only while the field is genuinely idle: text
  // moving under a typing cursor is hostile, and a shopper reading the options
  // shouldn't have them swapped mid-read. Also honours reduced motion — this is
  // animation, and the OS setting is a request to stop it.
  const rotating = terms.length > 1 && !focused && query.length === 0;
  useEffect(() => {
    if (!rotating) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const timer = setInterval(
      () => setPlaceholderIndex((i) => (i + 1) % terms.length),
      ROTATE_MS,
    );
    return () => clearInterval(timer);
  }, [rotating, terms.length]);

  // Modulo guards against an editor shortening the list while the index is past
  // the new end — otherwise the placeholder would vanish until the next tick.
  const placeholder = terms.length > 0 ? terms[placeholderIndex % terms.length] : DEFAULT_PLACEHOLDER;

  // Debounced fetch. The AbortController prevents a slow earlier request from
  // overwriting the results of a later one.
  //
  // Short queries simply skip fetching — stale results are filtered out below
  // by deriving from `query` rather than clearing state inside the effect.
  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) return;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search/suggestions?q=${encodeURIComponent(term)}`, {
          signal: controller.signal,
        });
        if (res.ok) setResults((await res.json()) as Suggestion);
      } catch {
        // Aborted or offline — leave the previous suggestions in place.
      }
    }, DEBOUNCE_MS);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query]);

  // Close when clicking outside.
  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  // Derived, so a query shortened below the threshold hides suggestions
  // immediately without an extra render pass.
  const active = query.trim().length >= 2 ? results : EMPTY;
  const items = [
    ...active.categories.map((c) => ({ kind: "category" as const, ...c })),
    ...active.products.map((p) => ({ kind: "product" as const, ...p })),
  ];
  const hasResults = items.length > 0;

  // The idle panel: shown while the field is open but nothing has been typed.
  // Before this, an open-but-empty box rendered nothing at all, so focusing the
  // search gave a shopper no route forward except knowing what to type.
  const showIdlePanel = query.trim().length === 0 && (recent.length > 0 || popular.length > 0);

  function go(href: string, remember?: string) {
    // Only what the shopper actually expressed goes into history — a typed
    // query or a chip they picked. Not product names they merely clicked past,
    // which would fill the list with things they never searched for.
    if (remember) recordSearch(remember);
    setOpen(false);
    setHighlight(-1);
    inputRef.current?.blur();
    router.push(href);
  }

  function submit() {
    const term = query.trim();
    if (term.length > 0) go(`/products?q=${encodeURIComponent(term)}`, term);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (!open || !hasResults) {
      if (event.key === "Enter") submit();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlight((i) => (i + 1) % items.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((i) => (i <= 0 ? items.length - 1 : i - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const item = items[highlight];
      if (item) {
        go(item.kind === "category" ? `/category/${item.slug}` : `/products/${item.slug}`);
      } else {
        submit();
      }
    }
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground" />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setHighlight(-1);
          }}
          onFocus={() => {
            setOpen(true);
            setFocused(true);
          }}
          onBlur={() => setFocused(false)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          aria-label="Search products"
          role="combobox"
          // The idle panel is a popup too, so it counts as expanded — a
          // combobox reporting collapsed while showing suggestions is a lie to
          // a screen reader.
          aria-expanded={open && (hasResults || showIdlePanel)}
          aria-controls={listId}
          aria-autocomplete="list"
          className="h-12 w-full rounded-full border border-input bg-background pl-11 pr-10 text-base outline-none transition-colors focus:border-ring [&::-webkit-search-cancel-button]:hidden"
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setResults(EMPTY);
              inputRef.current?.focus();
            }}
            aria-label="Clear search"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      {/* Idle: nothing typed yet. Recent first — a shopper returning to the
          field is far more often resuming than starting fresh. */}
      {open && !hasResults && showIdlePanel && (
        <div
          id={listId}
          className="absolute left-0 right-0 top-full z-50 mt-2 space-y-5 rounded-lg border bg-popover p-4 shadow-lg"
        >
          {recent.length > 0 && (
            <div>
              <div className="mb-2.5 flex items-center justify-between">
                <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                  <Clock className="size-3.5" /> Recent
                </p>
                <button
                  type="button"
                  onClick={clearRecentSearches}
                  className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                  Clear
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {recent.map((term) => (
                  <button
                    key={term}
                    type="button"
                    onClick={() => go(`/products?q=${encodeURIComponent(term)}`, term)}
                    className="rounded-full border px-3 py-1.5 text-sm transition-colors hover:border-brass hover:text-brass-text"
                  >
                    {term}
                  </button>
                ))}
              </div>
            </div>
          )}

          {popular.length > 0 && (
            <div>
              <p className="mb-2.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                <TrendingUp className="size-3.5" /> Popular
              </p>
              <div className="flex flex-wrap gap-2">
                {popular.map((term) => (
                  <button
                    key={term.href}
                    type="button"
                    // Deliberately not recorded as a recent search: a chip is a
                    // navigation, and it lands on /category/rings while the
                    // recent chip for the same word would run /products?q=rings.
                    // Recording it would put an entry in "Recent" that goes
                    // somewhere different from the click that created it.
                    onClick={() => go(term.href)}
                    className="rounded-full border bg-muted/40 px-3 py-1.5 text-sm transition-colors hover:border-brass hover:text-brass-text"
                  >
                    {term.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {open && hasResults && (
        <div
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-lg border bg-popover shadow-lg"
        >
          {active.categories.length > 0 && (
            <div className="border-b py-1.5">
              {active.categories.map((category) => {
                const index = items.findIndex(
                  (i) => i.kind === "category" && i.slug === category.slug
                );
                return (
                  <button
                    key={category.slug}
                    type="button"
                    role="option"
                    aria-selected={highlight === index}
                    onMouseEnter={() => setHighlight(index)}
                    onClick={() => go(`/category/${category.slug}`)}
                    className={`flex w-full items-center gap-2 px-4 py-2 text-left text-sm ${
                      highlight === index ? "bg-accent text-accent-foreground" : ""
                    }`}
                  >
                    <Search className="size-3.5 text-muted-foreground" />
                    <span>
                      {category.name}{" "}
                      <span className="text-muted-foreground">in categories</span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          <div className="py-1.5">
            {active.products.map((product) => {
              const index = items.findIndex(
                (i) => i.kind === "product" && i.slug === product.slug
              );
              return (
                <button
                  key={product.id}
                  type="button"
                  role="option"
                  aria-selected={highlight === index}
                  onMouseEnter={() => setHighlight(index)}
                  onClick={() => go(`/products/${product.slug}`)}
                  className={`flex w-full items-center gap-3 px-4 py-2 text-left ${
                    highlight === index ? "bg-accent text-accent-foreground" : ""
                  }`}
                >
                  <span className="relative size-9 shrink-0 overflow-hidden rounded bg-muted">
                    {product.image && (
                      <Image
                        src={product.image}
                        alt=""
                        fill
                        className="object-cover"
                        sizes="36px"
                      />
                    )}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm">{product.name}</span>
                  <span className="text-sm font-medium">
                    {inr.format(Number(product.price))}
                  </span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={submit}
            className="w-full border-t px-4 py-2.5 text-left text-sm text-brass-text hover:bg-accent"
          >
            See all results for &ldquo;{query.trim()}&rdquo;
          </button>
        </div>
      )}
    </div>
  );
}
