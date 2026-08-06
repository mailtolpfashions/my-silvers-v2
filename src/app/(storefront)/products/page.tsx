import { Suspense } from "react";
import { searchProducts, getActiveCategories } from "@/server/products/search";
import { ProductFilters } from "@/components/storefront/product-filters";
import { ProductGrid } from "@/components/storefront/product-grid";
import { ProductGridSkeleton } from "@/components/storefront/product-card-skeleton";
import { Skeleton } from "@/components/ui/skeleton";
import { StickyBarSpacer } from "@/components/storefront/sticky-action-bar";
import { PRODUCT_PAGE_SIZE } from "@/lib/product-page-size";

type SearchParams = Promise<{
  q?: string;
  category?: string;
  sort?: string;
  minPrice?: string;
  maxPrice?: string;
}>;

/**
 * The page shell awaits nothing, so the heading and layout can prerender while
 * the filter bar and the results stream in behind their own boundaries. Both
 * children receive the searchParams promise rather than an awaited value —
 * awaiting it here would pull the whole page back to request time.
 */
export default function ProductsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="container-page py-10">
      <h1 className="text-h1">Shop all jewellery</h1>

      {/* No top margin below md: the filters render as a pinned bottom bar
          there, so this wrapper is empty and would only add a gap. */}
      <div className="md:mt-6">
        <Suspense fallback={<Skeleton className="hidden h-10 w-full max-w-2xl md:block" />}>
          <FilterBar searchParams={searchParams} />
        </Suspense>
      </div>

      <Suspense fallback={<ProductGridSkeleton count={PRODUCT_PAGE_SIZE > 12 ? 12 : 8} />}>
        <Results searchParams={searchParams} />
      </Suspense>

      {/* Room for that pinned bar, or it covers the last row of the grid. */}
      <StickyBarSpacer />
    </div>
  );
}

/**
 * Its own boundary because ProductFilters calls useSearchParams() — without one
 * the entire route opts out of static rendering.
 */
async function FilterBar({ searchParams }: { searchParams: SearchParams }) {
  const [params, categories] = await Promise.all([searchParams, getActiveCategories()]);

  return (
    <ProductFilters
      categories={categories.map((c) => ({ slug: c.slug, name: c.name }))}
      current={{
        category: params.category,
        sort: params.sort,
        minPrice: params.minPrice,
        maxPrice: params.maxPrice,
      }}
    />
  );
}

async function Results({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;

  const filters = {
    q: params.q,
    category: params.category,
    sort: params.sort,
    minPrice: params.minPrice,
    maxPrice: params.maxPrice,
  };

  // The first page is rendered on the server; ProductGrid appends the rest as
  // the shopper scrolls.
  const { items, total } = await searchProducts({
    q: params.q,
    categorySlug: params.category,
    sort: params.sort as "newest" | "price-asc" | "price-desc" | "featured" | undefined,
    minPrice: params.minPrice ? Number(params.minPrice) : undefined,
    maxPrice: params.maxPrice ? Number(params.maxPrice) : undefined,
    page: 1,
    pageSize: PRODUCT_PAGE_SIZE,
  });

  if (items.length === 0) {
    return (
      <>
        <p className="mt-1 text-sm text-muted-foreground">0 products</p>
        <p className="mt-16 text-center text-muted-foreground">
          No products found. Try a different search or filter.
        </p>
      </>
    );
  }

  return (
    <>
      <p className="mt-1 text-sm text-muted-foreground">{total} products</p>
      <ProductGrid
        // Remount on filter change so appended pages never outlive their query.
        // Every filter must be in the key, or changing one leaves appended
        // pages from the previous query in place.
        key={[
          params.q ?? "",
          params.category ?? "",
          params.sort ?? "",
          params.minPrice ?? "",
          params.maxPrice ?? "",
        ].join("|")}
        initialItems={items}
        initialHasMore={total > PRODUCT_PAGE_SIZE}
        total={total}
        params={filters}
      />
    </>
  );
}
