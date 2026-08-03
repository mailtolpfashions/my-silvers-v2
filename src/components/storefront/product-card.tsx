import Link from "next/link";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { stockLabel, isScarce } from "@/lib/stock-label";
import { AddToCartButton } from "@/components/storefront/add-to-cart-button";
import { WishlistButton } from "@/components/storefront/wishlist-button";
import type { ProductListItem } from "@/server/products/search";

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

export function ProductCard({
  product,
  isAuthed = false,
  inWishlist = false,
  cartQuantity = 0,
  showActions = true,
}: {
  product: ProductListItem;
  isAuthed?: boolean;
  inWishlist?: boolean;
  cartQuantity?: number;
  /** Set false to render a plain, non-interactive card. */
  showActions?: boolean;
}) {
  const image = product.images[0];
  const price = Number(product.price);
  const compareAt = product.compareAtPrice ? Number(product.compareAtPrice) : null;
  const discount =
    compareAt && compareAt > price ? Math.round(((compareAt - price) / compareAt) * 100) : null;
  const href = `/products/${product.slug}`;

  return (
    // Not a <Link> wrapper: the card holds buttons, and interactive elements
    // cannot legally nest inside an anchor — it breaks keyboard navigation and
    // screen readers. A stretched overlay link keeps the image clickable.
    <div className="group relative">
      <div className="relative aspect-square overflow-hidden rounded-lg bg-muted">
        {image ? (
          <Image
            src={image}
            alt={product.name}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 400px"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No image
          </div>
        )}

        <Link href={href} className="absolute inset-0 z-0" aria-label={product.name} />

        {/* All badges stack down the left so the wishlist heart owns the right
            corner alone. A sold-out piece shows only that — a discount on
            something unbuyable is noise. */}
        <div className="absolute left-3 top-3 z-10 flex flex-col items-start gap-1.5">
          {product.stock <= 0 ? (
            <Badge variant="secondary">Out of stock</Badge>
          ) : (
            <>
              {discount !== null && discount > 0 && (
                <Badge className="bg-gold text-ink hover:bg-gold">{discount}% off</Badge>
              )}
              {product.isBestseller && <Badge variant="secondary">Bestseller</Badge>}
            </>
          )}
        </div>

        {showActions && (
          <div className="absolute right-2 top-2 z-10">
            <WishlistButton
              productId={product.id}
              isAuthed={isAuthed}
              initialInWishlist={inWishlist}
              iconOnly
            />
          </div>
        )}
      </div>

      <div className="mt-4 space-y-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gold-text">
          {product.categoryName}
        </p>
        <h3 className="line-clamp-2 min-h-[2.75rem] text-base leading-snug text-foreground">
          <Link href={href} className="hover:underline">
            {product.name}
          </Link>
        </h3>
        <div className="flex flex-wrap items-baseline gap-2 pt-0.5">
          <span className="text-lg font-semibold text-foreground">{inr.format(price)}</span>
          {compareAt && compareAt > price && (
            <span className="text-sm text-muted-foreground line-through">
              {inr.format(compareAt)}
            </span>
          )}
        </div>
        {/* Scarcity, never a count — see src/lib/stock-label.ts. */}
        {isScarce(product.stock) && (
          <p className="text-xs font-medium text-gold-text">{stockLabel(product.stock)}</p>
        )}

        {showActions && (
          <AddToCartButton
            productId={product.id}
            stock={product.stock}
            isAuthed={isAuthed}
            cartQuantity={cartQuantity}
            compact
          />
        )}
      </div>
    </div>
  );
}
