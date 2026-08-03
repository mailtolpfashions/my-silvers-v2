import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth/auth";
import { getWishlistProducts, getCartQuantityMap } from "@/server/cart";
import { ProductCard } from "@/components/storefront/product-card";
import { Button } from "@/components/ui/button";

export default async function WishlistPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?redirect=/wishlist");

  const [products, cartQuantities] = await Promise.all([
    getWishlistProducts(session.user.id),
    getCartQuantityMap(session.user.id),
  ]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="mb-8 text-2xl font-semibold">Your wishlist</h1>

      {products.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-muted-foreground">Your wishlist is empty.</p>
          <Button asChild className="mt-4">
            <Link href="/products">Browse jewellery</Link>
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4">
          {products.map((product) => (
            <ProductCard
              key={product.id}
              isAuthed
              // Everything on this page is, by definition, wishlisted.
              inWishlist
              cartQuantity={cartQuantities.get(product.id) ?? 0}
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
