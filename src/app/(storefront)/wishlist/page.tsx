import { redirect } from "next/navigation";
import { auth } from "@/server/auth/auth";
import { getWishlistProducts } from "@/server/cart";
import { ProductCard, productMorphName, PRODUCT_GRID_CLASS } from "@/components/storefront/product-card";
import { EditorialLink } from "@/components/storefront/editorial-link";

export default async function WishlistPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?redirect=/wishlist");

  const products = await getWishlistProducts(session.user.id);

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
        // exactly as it did where the shopper saved it. Add-to-cart is on the
        // product page — see the note in add-to-cart-button.tsx.
        <div className={PRODUCT_GRID_CLASS}>
          {products.map((product) => (
            <ProductCard
              key={product.id}
              morphName={productMorphName(product.id)}
              product={{
                id: product.id,
                name: product.name,
                slug: product.slug,
                price: product.price.toString(),
                compareAtPrice: product.compareAtPrice?.toString() ?? null,
                images: product.images,
                isBestseller: product.isBestseller,
                isFeatured: product.isFeatured,
                stock: product.stock,
                categoryName: product.category.name,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
