import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth/auth";
import { getWishlistProducts } from "@/server/cart";
import { ProductCard, productMorphName, PRODUCT_GRID_CLASS } from "@/components/storefront/product-card";
import { Button } from "@/components/ui/button";

export default async function WishlistPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?redirect=/wishlist");

  const products = await getWishlistProducts(session.user.id);

  return (
    <div className="container-page py-10">
      <h1 className="mb-8 text-h1">Your wishlist</h1>

      {products.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-muted-foreground">Your wishlist is empty.</p>
          <Button asChild className="mt-4">
            <Link href="/products">Browse jewellery</Link>
          </Button>
        </div>
      ) : (
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
