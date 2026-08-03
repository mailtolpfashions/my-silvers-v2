"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { ProductCard } from "@/components/storefront/product-card";
import { Button } from "@/components/ui/button";
import { loadMoreProducts } from "@/actions/product-list-actions";
import type { ProductListItem } from "@/server/products/search";

/**
 * Number of pages that load automatically on scroll before the shopper has to
 * ask for more. Without a ceiling the footer is unreachable — every time you
 * approach it, another 24 products push it further away. After this many
 * auto-loads the sentinel stops firing and only the button loads more, so the
 * page has a real bottom.
 */
const AUTO_LOAD_LIMIT = 2;

/**
 * Server-renders the first page (so the grid is in the HTML for crawlers and
 * first paint), then appends further pages as the sentinel scrolls into view.
 *
 * The parent passes a `key` derived from the active filters, so changing a
 * filter remounts this and resets pagination — no stale pages from the
 * previous query can survive.
 */
export function ProductGrid({
  initialItems,
  initialHasMore,
  total,
  params,
  isAuthed = false,
  wishlistIds = [],
  cartQuantities = {},
}: {
  initialItems: ProductListItem[];
  initialHasMore: boolean;
  total: number;
  params: {
    q?: string;
    category?: string;
    sort?: string;
    minPrice?: string;
    maxPrice?: string;
  };
  isAuthed?: boolean;
  /** Every wishlisted product id, so appended pages need no extra fetch. */
  wishlistIds?: string[];
  cartQuantities?: Record<string, number>;
}) {
  const wishlisted = new Set(wishlistIds);
  const [items, setItems] = useState(initialItems);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [error, setError] = useState<string | null>(null);
  const [autoLoads, setAutoLoads] = useState(0);
  const [isPending, startTransition] = useTransition();

  const autoLoadExhausted = autoLoads >= AUTO_LOAD_LIMIT;

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  // Guards against the observer firing again while a fetch is already in flight.
  const loadingRef = useRef(false);

  const loadMore = useCallback((source: "scroll" | "click" = "click") => {
    if (loadingRef.current || !hasMore) return;
    loadingRef.current = true;
    setError(null);
    if (source === "scroll") setAutoLoads((n) => n + 1);

    startTransition(async () => {
      try {
        const next = await loadMoreProducts({ ...params, page: page + 1 });
        setItems((current) => {
          // De-dupe defensively: a product created between requests shifts the
          // OFFSET window and can repeat an id, which would break React keys.
          const seen = new Set(current.map((p) => p.id));
          return [...current, ...next.items.filter((p) => !seen.has(p.id))];
        });
        setPage((p) => p + 1);
        setHasMore(next.hasMore);
      } catch {
        setError("Could not load more products.");
      } finally {
        loadingRef.current = false;
      }
    });
  }, [hasMore, page, params]);

  useEffect(() => {
    const node = sentinelRef.current;
    // Once the auto-load budget is spent, stop observing entirely so the
    // shopper can actually reach the footer.
    if (!node || !hasMore || autoLoadExhausted) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore("scroll");
      },
      // Start fetching before the sentinel is visible so new rows are usually
      // ready by the time the user reaches them.
      { rootMargin: "600px 0px" }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [loadMore, hasMore, autoLoadExhausted]);

  return (
    <>
      {/* Wider gap between rows than columns — vertical breathing room separates
          rows without pushing the columns apart and shrinking each image. */}
      <div className="mt-8 grid grid-cols-2 gap-x-5 gap-y-10 sm:grid-cols-3 lg:grid-cols-4">
        {items.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            isAuthed={isAuthed}
            inWishlist={wishlisted.has(product.id)}
            cartQuantity={cartQuantities[product.id] ?? 0}
          />
        ))}
      </div>

      {/* Announce new results to screen readers, which can't perceive the append. */}
      <p aria-live="polite" className="sr-only">
        {isPending ? "Loading more products" : `Showing ${items.length} products`}
      </p>

      <div ref={sentinelRef} className="mt-10 flex flex-col items-center gap-3">
        {isPending && (
          <p className="text-sm text-muted-foreground">Loading more…</p>
        )}

        {error && (
          <>
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" size="sm" onClick={() => loadMore("click")}>
              Try again
            </Button>
          </>
        )}

        {/* Always present: the only control once auto-loading is exhausted, and
            the keyboard-accessible path before that. */}
        {hasMore && !isPending && !error && (
          <>
            <Button variant="outline" size="sm" onClick={() => loadMore("click")}>
              Load more
            </Button>
            {autoLoadExhausted && (
              <p className="text-xs text-muted-foreground">
                Showing {items.length} of {total} — use filters to narrow your search
              </p>
            )}
          </>
        )}

        {!hasMore && items.length > 0 && (
          <p className="text-sm text-muted-foreground">
            You&apos;ve reached the end — {items.length} products
          </p>
        )}
      </div>
    </>
  );
}
