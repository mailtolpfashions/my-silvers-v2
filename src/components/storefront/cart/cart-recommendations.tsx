import { ProductCard } from "@/components/storefront/product-card";
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
  isAuthed,
  wishlistIds,
  cartQuantities,
}: {
  excludeProductIds: string[];
  subtotalPaise: number;
  isAuthed: boolean;
  wishlistIds?: Set<string>;
  cartQuantities?: Map<string, number>;
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

      <div className="mt-6 grid grid-cols-2 gap-x-5 gap-y-10 sm:grid-cols-3 lg:grid-cols-4">
        {items.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            isAuthed={isAuthed}
            inWishlist={wishlistIds?.has(product.id) ?? false}
            cartQuantity={cartQuantities?.get(product.id) ?? 0}
          />
        ))}
      </div>
    </section>
  );
}
