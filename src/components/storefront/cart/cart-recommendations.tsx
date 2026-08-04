import { ProductCard, productMorphName, PRODUCT_GRID_CLASS } from "@/components/storefront/product-card";
import { getCartRecommendations } from "@/server/products/recommendations";

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

/**
 * Budget-aware add-ons below the cart. Renders nothing when there is nothing
 * suitable to show, rather than an empty heading.
 */
export async function CartRecommendations({
  excludeProductIds,
  subtotalPaise,
}: {
  excludeProductIds: string[];
  subtotalPaise: number;
}) {
  const { items, ceiling } = await getCartRecommendations({
    excludeProductIds,
    subtotalPaise,
  });

  if (items.length === 0) return null;

  return (
    <section className="mt-16 border-t pt-10">
      <h2 className="text-xl font-semibold tracking-tight">You may also like</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Pieces under {inr.format(ceiling)} that go well with your order
      </p>

      <div className={`mt-6 ${PRODUCT_GRID_CLASS}`}>
        {items.map((product) => (
          <ProductCard key={product.id} product={product} morphName={productMorphName(product.id)} />
        ))}
      </div>
    </section>
  );
}
