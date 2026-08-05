"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { ProductCard, PRODUCT_GRID_CLASS } from "@/components/storefront/product-card";
import {
  recordProductView,
  subscribeRecentlyViewed,
  getRecentlyViewedSnapshot,
  getRecentlyViewedServerSnapshot,
} from "@/lib/recently-viewed";
import type { ProductListItem } from "@/server/products/search";

/**
 * Records the current product as viewed. Renders nothing.
 *
 * Split from the display component so the product page can record a view
 * without also mounting the grid.
 */
export function RecordProductView({ productId }: { productId: string }) {
  useEffect(() => {
    recordProductView(productId);
  }, [productId]);
  return null;
}

/**
 * "Recently viewed", read from localStorage and hydrated with real product data
 * from /api/products/summaries.
 *
 * The ids live on the client, so the page itself stays identical for every
 * shopper and remains cacheable — see src/lib/recently-viewed.ts.
 */
export function RecentlyViewed({ excludeProductId }: { excludeProductId?: string }) {
  const ids = useSyncExternalStore(
    subscribeRecentlyViewed,
    getRecentlyViewedSnapshot,
    getRecentlyViewedServerSnapshot
  );
  const [items, setItems] = useState<ProductListItem[] | null>(null);

  // The product being viewed is not "recently viewed" from where the shopper
  // is standing — it's the thing in front of them.
  const wanted = ids.filter((id) => id !== excludeProductId).slice(0, 4);
  const key = wanted.join(",");

  useEffect(() => {
    // No setState here on the empty path — the render guard below already
    // handles it, and setting state synchronously in an effect just costs an
    // extra render pass.
    if (wanted.length === 0) return;
    const controller = new AbortController();
    fetch(`/api/products/summaries?ids=${encodeURIComponent(key)}`, {
      signal: controller.signal,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (!json?.items) return;
        // Preserve recency order — the API returns whatever order the database
        // felt like, which would shuffle the row on every render.
        const byId = new Map<string, ProductListItem>(
          (json.items as ProductListItem[]).map((p) => [p.id, p])
        );
        setItems(wanted.map((id) => byId.get(id)).filter(Boolean) as ProductListItem[]);
      })
      .catch(() => {
        /* aborted or offline — leave the section out rather than erroring */
      });
    return () => controller.abort();
    // `key` is the stable identity of `wanted`; depending on the array itself
    // would refetch on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (wanted.length === 0 || !items || items.length === 0) return null;

  return (
    <section className="container-page border-t py-10 sm:py-14">
      <h2 className="mb-8 text-h2">Recently viewed</h2>
      <div className={PRODUCT_GRID_CLASS}>
        {items.map((product) => (
          // No morphName: the same product can appear here and in another row
          // on this page, and a duplicate view-transition-name would disable
          // the morph document-wide.
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </section>
  );
}
