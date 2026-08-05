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
    // Breaks out of the cart's narrow container back to the page width.
    // The cart itself is intentionally narrow (single task, summary beside the
    // items), but squeezing a four-column product grid into 1024px makes these
    // cards smaller than the same grid everywhere else on the site.
    // Underscores are Tailwind arbitrary-value syntax for spaces: calc needs
    // whitespace around the minus, and calc(50%-50vw) is invalid CSS that gets
    // silently dropped. container-page then
    // re-applies the normal gutters and max width.
    <section className="mt-16 border-t pt-10 [margin-inline:calc(50%_-_50vw)]">
      <div className="container-page">
        <h2 className="text-h2">You may also like</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Pieces under {inr.format(ceiling)} that go well with your order
        </p>

        <div className={`mt-6 ${PRODUCT_GRID_CLASS}`}>
        {items.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              morphName={productMorphName(product.id)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
