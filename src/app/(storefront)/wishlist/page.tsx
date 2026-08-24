import { Suspense, cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth/auth";
import { getWishlistProducts } from "@/server/cart";
import { toProductListItem } from "@/server/products/search";
import { withBlurPlaceholders } from "@/server/media/blur";
import { ProductCard, productMorphName, PRODUCT_GRID_CLASS } from "@/components/storefront/product-card";
import { EditorialLink } from "@/components/storefront/editorial-link";
import { RevealSection } from "@/components/storefront/reveal-section";
import { ProductGridSkeleton } from "@/components/storefront/product-card-skeleton";

/**
 * The masthead prerenders; the saved pieces stream.
 *
 * The count moved inside the streamed part with them — it is derived from the
 * list, so it cannot be known any earlier, and holding the whole heading back
 * for one line of text would waste the shell.
 */
export default function WishlistPage() {
  return (
    <div className="container-page rhythm-commerce">
      <div className="mb-10 border-b pb-6">
        <p className="label-eyebrow mb-3">Saved</p>
        <h1 className="text-h1">Your wishlist</h1>
        <Suspense fallback={null}>
          <SavedCount />
        </Suspense>
      </div>

      <Suspense fallback={<ProductGridSkeleton />}>
        <SavedProducts />
      </Suspense>
    </div>
  );
}

/**
 * Both halves call this, so it is memoized for the request.
 *
 * ⚠️  `cache()` is doing real work here, not decoration. `getWishlistProducts`
 * is not memoized itself — checked — so without this the count and the grid
 * would each run the query, and each would pay a full round trip to the
 * database for the same rows.
 *
 * React's `cache()` and not `"use cache"`: this is per-shopper data keyed on a
 * session, which must not be shared between requests. The goal is deduplication
 * within one render, which is exactly what `cache()` is for.
 */
const loadSaved = cache(async function loadSaved(redirectTo: string) {
  const session = await auth();
  if (!session?.user?.id) redirect(`/login?redirect=${redirectTo}`);

  // Mapped and given their blurred previews here rather than inline in the
  // grid: this page builds its own list items instead of going through
  // searchProducts, so it has to ask for the placeholders itself.
  return withBlurPlaceholders(
    (await getWishlistProducts(session.user.id)).map(toProductListItem),
  );
});

async function SavedCount() {
  const products = await loadSaved("/wishlist");
  if (products.length === 0) return null;
  return (
    <p className="mt-3 text-sm text-muted-foreground">
      {products.length} {products.length === 1 ? "piece" : "pieces"} saved
    </p>
  );
}

async function SavedProducts() {
  const products = await loadSaved("/wishlist");

  if (products.length === 0) {
    // A premium empty state: a sentence explaining what the page is for and
    // one way forward. It was a grey line and a rounded button.
    return (
      <div className="rhythm-commerce text-center">
        <p className="text-h3">Nothing saved yet</p>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
          Tap the heart on any piece to keep it here while you decide. Your wishlist stays
          with your account, on every device.
        </p>
        <div className="mt-8 flex justify-center">
          <EditorialLink href="/products">Browse all jewellery</EditorialLink>
        </div>
      </div>
    );
  }

  // The same card as every other grid on the site, so a saved piece looks
  // exactly as it did where the shopper saved it — including its
  // add-to-cart control.
  return (
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
  );
}
