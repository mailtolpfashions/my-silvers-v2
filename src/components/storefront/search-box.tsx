"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Search, X } from "lucide-react";

type Suggestion = {
  products: Array<{ id: string; name: string; slug: string; image: string | null; price: string }>;
  categories: Array<{ name: string; slug: string }>;
};

const EMPTY: Suggestion = { products: [], categories: [] };
const DEBOUNCE_MS = 200;

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

export function SearchBox({ className = "" }: { className?: string }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Suggestion>(EMPTY);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listId = useId();

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

  function go(href: string) {
    setOpen(false);
    setHighlight(-1);
    inputRef.current?.blur();
    router.push(href);
  }

  function submit() {
    const term = query.trim();
    if (term.length > 0) go(`/products?q=${encodeURIComponent(term)}`);
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
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setHighlight(-1);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search for rings, earrings, anklets…"
          aria-label="Search products"
          role="combobox"
          aria-expanded={open && hasResults}
          aria-controls={listId}
          aria-autocomplete="list"
          className="h-11 w-full rounded-full border border-input bg-background pl-10 pr-10 text-sm outline-none transition-colors focus:border-ring [&::-webkit-search-cancel-button]:hidden"
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
            className="w-full border-t px-4 py-2.5 text-left text-sm text-gold-text hover:bg-accent"
          >
            See all results for &ldquo;{query.trim()}&rdquo;
          </button>
        </div>
      )}
    </div>
  );
}
