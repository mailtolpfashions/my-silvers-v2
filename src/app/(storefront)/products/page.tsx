import { auth } from "@/server/auth/auth";
import { getCartQuantityMap, getWishlistProductIds } from "@/server/cart";
import { searchProducts, getActiveCategories } from "@/server/products/search";
import { ProductFilters } from "@/components/storefront/product-filters";
import { ProductGrid } from "@/components/storefront/product-grid";
import { PRODUCT_PAGE_SIZE } from "@/lib/product-page-size";

type SearchParams = Promise<{
  q?: string;
  category?: string;
  sort?: string;
  minPrice?: string;
  maxPrice?: string;
}>;

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const session = await auth();
  const userId = session?.user?.id;

  // Wishlist and cart state for the card buttons — two queries covering the
  // whole account, so infinite-scroll appends need no further fetching.
  const [wishlistIds, cartQuantities] = userId
    ? await Promise.all([getWishlistProductIds(userId), getCartQuantityMap(userId)])
    : [new Set<string>(), new Map<string, number>()];

  // The first page is rendered on the server; ProductGrid appends the rest as
  // the shopper scrolls.
  const [{ items, total }, categories] = await Promise.all([
    searchProducts({
      q: params.q,
      categorySlug: params.category,
      sort: params.sort as "newest" | "price-asc" | "price-desc" | "featured" | undefined,
      minPrice: params.minPrice ? Number(params.minPrice) : undefined,
      maxPrice: params.maxPrice ? Number(params.maxPrice) : undefined,
      page: 1,
      pageSize: PRODUCT_PAGE_SIZE,
    }),
    getActiveCategories(),
  ]);

  const filters = {
    q: params.q,
    category: params.category,
    sort: params.sort,
    minPrice: params.minPrice,
    maxPrice: params.maxPrice,
  };

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-10 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-semibold tracking-tight">Shop all jewellery</h1>
      <p className="mt-1 text-sm text-muted-foreground">{total} products</p>

      <div className="mt-6">
        <ProductFilters
          categories={categories.map((c) => ({ slug: c.slug, name: c.name }))}
          current={filters}
        />
      </div>

      {items.length === 0 ? (
        <p className="mt-16 text-center text-muted-foreground">
          No products found. Try a different search or filter.
        </p>
      ) : (
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
          isAuthed={!!userId}
          wishlistIds={[...wishlistIds]}
          cartQuantities={Object.fromEntries(cartQuantities)}
        />
      )}
    </div>
  );
}
