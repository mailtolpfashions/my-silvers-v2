import { redirect } from "next/navigation";
import { auth } from "@/server/auth/auth";
import { getWishlistProducts } from "@/server/cart";
import { toProductListItem } from "@/server/products/search";
import { withBlurPlaceholders } from "@/server/media/blur";
import { ProductCard, productMorphName, PRODUCT_GRID_CLASS } from "@/components/storefront/product-card";
import { EditorialLink } from "@/components/storefront/editorial-link";
import { RevealSection } from "@/components/storefront/reveal-section";

export default async function WishlistPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?redirect=/wishlist");

  // Mapped and given their blurred previews here rather than inline in the
  // grid: this page builds its own list items instead of going through
  // searchProducts, so it has to ask for the placeholders itself.
  const products = await withBlurPlaceholders(
    (await getWishlistProducts(session.user.id)).map(toProductListItem),
  );

  return (
    <div className="container-page rhythm-commerce">
      <div className="mb-10 border-b pb-6">
        <p className="label-eyebrow mb-3">Saved</p>
        <h1 className="text-h1">Your wishlist</h1>
        {products.length > 0 && (
          <p className="mt-3 text-sm text-muted-foreground">
            {products.length} {products.length === 1 ? "piece" : "pieces"} saved
          </p>
        )}
      </div>

      {products.length === 0 ? (
        // A premium empty state: a sentence explaining what the page is for and
        // one way forward. It was a grey line and a rounded button.
        <div className="rhythm-commerce text-center">
          <p className="text-h3">Nothing saved yet</p>
          <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
            Tap the heart on any piece to keep it here while you decide. Your
            wishlist stays with your account, on every device.
          </p>
          <div className="mt-8 flex justify-center">
            <EditorialLink href="/products">Browse all jewellery</EditorialLink>
          </div>
        </div>
      ) : (
        // The same card as every other grid on the site, so a saved piece looks
        // exactly as it did where the shopper saved it — including its
        // add-to-cart control.
        <RevealSection as="div" stagger className={PRODUCT_GRID_CLASS}>
          {products.map((product, i) => (
            <ProductCard
              key={product.id}
              morphName={productMorphName(product.id)}
              product={product}
              eager={i < 4}
            />
          ))}
        </RevealSection>
      )}
    </div>
  );
}
