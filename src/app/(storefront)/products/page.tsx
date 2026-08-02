import { searchProducts, getActiveCategories } from "@/server/products/search";
import { ProductCard } from "@/components/storefront/product-card";
import { ProductFilters } from "@/components/storefront/product-filters";

type SearchParams = Promise<{
  q?: string;
  category?: string;
  sort?: string;
  page?: string;
}>;

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const page = params.page ? Number(params.page) : 1;

  const [{ items, total }, categories] = await Promise.all([
    searchProducts({
      q: params.q,
      categorySlug: params.category,
      sort: params.sort as "newest" | "price-asc" | "price-desc" | "featured" | undefined,
      page,
    }),
    getActiveCategories(),
  ]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-2xl font-semibold">Shop all jewellery</h1>
      <p className="mt-1 text-sm text-muted-foreground">{total} products</p>

      <div className="mt-6">
        <ProductFilters
          categories={categories.map((c) => ({ slug: c.slug, name: c.name }))}
          current={{ q: params.q, category: params.category, sort: params.sort }}
        />
      </div>

      {items.length === 0 ? (
        <p className="mt-16 text-center text-muted-foreground">
          No products found. Try a different search or filter.
        </p>
      ) : (
        <div className="mt-8 grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </div>
  );
}
