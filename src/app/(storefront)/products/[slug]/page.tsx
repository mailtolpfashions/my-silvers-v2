import { notFound } from "next/navigation";
import Image from "next/image";
import { auth } from "@/server/auth/auth";
import { getProductBySlug } from "@/server/products/search";
import { isInWishlist } from "@/server/cart";
import { Badge } from "@/components/ui/badge";
import { AddToCartButton } from "@/components/storefront/add-to-cart-button";
import { WishlistButton } from "@/components/storefront/wishlist-button";
import { ReviewSection } from "@/components/storefront/reviews/review-section";

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [product, session] = await Promise.all([getProductBySlug(slug), auth()]);

  if (!product) notFound();

  const isAuthed = !!session?.user?.id;
  const inWishlist = isAuthed ? await isInWishlist(session.user.id, product.id) : false;
  const image = product.images[0];

  return (
    <>
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-10 sm:grid-cols-2">
        <div className="relative aspect-square overflow-hidden rounded-lg bg-muted">
          {image ? (
            <Image src={image} alt={product.name} fill className="object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              No image available
            </div>
          )}
        </div>

        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {product.category.name}
          </p>
          <h1 className="mt-1 text-2xl font-semibold">{product.name}</h1>

          <div className="mt-3 flex items-center gap-2">
            {product.isBestseller && <Badge variant="secondary">Bestseller</Badge>}
            {product.isFeatured && <Badge variant="outline">Featured</Badge>}
          </div>

          <div className="mt-4 flex items-baseline gap-3">
            <span className="text-2xl font-semibold">₹{product.price.toString()}</span>
            {product.compareAtPrice && (
              <span className="text-muted-foreground line-through">
                ₹{product.compareAtPrice.toString()}
              </span>
            )}
          </div>

          <p className="mt-6 text-sm text-muted-foreground">{product.description}</p>

          <dl className="mt-6 space-y-1 text-sm">
            <div className="flex justify-between border-b py-2">
              <dt className="text-muted-foreground">Purity</dt>
              <dd>{product.purity}</dd>
            </div>
            {product.weight && (
              <div className="flex justify-between border-b py-2">
                <dt className="text-muted-foreground">Weight</dt>
                <dd>{product.weight.toString()}g</dd>
              </div>
            )}
            {product.sizes.length > 0 && (
              <div className="flex justify-between border-b py-2">
                <dt className="text-muted-foreground">Available sizes</dt>
                <dd>{product.sizes.join(", ")}</dd>
              </div>
            )}
            <div className="flex justify-between border-b py-2">
              <dt className="text-muted-foreground">Stock</dt>
              <dd>{product.stock > 0 ? "In stock" : "Out of stock"}</dd>
            </div>
          </dl>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <AddToCartButton productId={product.id} stock={product.stock} isAuthed={isAuthed} />
            <WishlistButton
              productId={product.id}
              isAuthed={isAuthed}
              initialInWishlist={inWishlist}
            />
          </div>
        </div>
      </div>

      <ReviewSection
        productId={product.id}
        productSlug={product.slug}
        isAuthed={isAuthed}
      />
    </>
  );
}
