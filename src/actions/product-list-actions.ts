"use server";

import { searchProducts, type ProductListItem } from "@/server/products/search";
import { PRODUCT_PAGE_SIZE } from "@/lib/product-page-size";

/**
 * Fetches the next slice for the infinite-scroll grid. Reuses searchProducts so
 * filtering/sorting/clamping stay in one place — the client only supplies the
 * same params already encoded in the URL.
 */
export async function loadMoreProducts(input: {
  q?: string;
  category?: string;
  sort?: string;
  page: number;
}): Promise<{ items: ProductListItem[]; hasMore: boolean }> {
  const page = Math.max(1, Math.trunc(Number(input.page) || 1));

  const { items, total } = await searchProducts({
    q: input.q,
    categorySlug: input.category,
    sort: input.sort as "newest" | "price-asc" | "price-desc" | "featured" | undefined,
    page,
    pageSize: PRODUCT_PAGE_SIZE,
  });

  return { items, hasMore: page * PRODUCT_PAGE_SIZE < total };
}
