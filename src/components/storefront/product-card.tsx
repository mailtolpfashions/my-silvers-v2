import { ViewTransition } from "react";
import Link from "next/link";
import Image from "next/image";
import { stockLabel, isScarce } from "@/lib/stock-label";
import { formatINR } from "@/lib/format";
import {
  CARD_IMAGE_CLASS,
  CARD_TITLE_CLASS,
  CARD_SHELL_CLASS,
  CARD_PILL_CLASS,
} from "@/lib/card-styles";
import { AddToCartButton } from "@/components/storefront/add-to-cart-button";
import { WishlistButton } from "@/components/storefront/wishlist-button";
import type { ProductListItem } from "@/server/products/search";

/**
 * Geometry lives in @/lib/card-styles so the skeleton and the card's own
 * buttons can share it without importing this server component. Re-exported
 * here because every listing page already reaches for PRODUCT_GRID_CLASS
 * through this module.
 */
export {
  CARD_IMAGE_CLASS,
  CARD_TITLE_CLASS,
  CARD_SHELL_CLASS,
  CARD_CTA_CLASS,
  PRODUCT_GRID_CLASS,
} from "@/lib/card-styles";

/**
 * The shared identity for the card-image → product-page morph. Both ends must
 * agree, so it lives here rather than being spelled out at each call site.
 */
export function productMorphName(productId: string) {
  return `product-${productId}`;
}

/**
 * Wraps children in a <ViewTransition> only when a name was supplied. Without
 * the guard, every card on the page would claim a transition name and any
 * duplicate would silently disable the animation document-wide.
 */
function MaybeMorph({ name, children }: { name?: string; children: React.ReactNode }) {
  if (!name) return children;
  return (
    <ViewTransition name={name} share="morph">
      {children}
    </ViewTransition>
  );
}

/**
 * Deliberately a pure function of the product.
 *
 * Wishlist and cart membership used to arrive here as props, which made every
 * grid on the site different for every visitor and kept listing pages out of
 * the cache entirely. The two buttons now read that state from the shared
 * client store instead — see src/lib/user-state-store.ts. Do not reintroduce
 * per-shopper props here.
 */
export function ProductCard({
  product,
  showActions = true,
  morphName,
}: {
  product: ProductListItem;
  /** Set false to render a plain, non-interactive card. */
  showActions?: boolean;
  /**
   * Opts this card's image into the shared-element morph into the product page.
   *
   * The caller supplies the name because uniqueness is a page-level concern:
   * two elements sharing a view-transition-name make the browser skip the
   * transition for the entire document, and the homepage can legitimately show
   * one product in two sections. Callers that can guarantee uniqueness pass
   * `productMorphName(product.id)`; the homepage dedupes first.
   */
  morphName?: string;
}) {
  const image = product.images[0];
  // Second angle, revealed on hover. Pure CSS crossfade so the card stays a
  // server component with no client JS of its own.
  const hoverImage = product.images[1];
  const price = Number(product.price);
  const compareAt = product.compareAtPrice ? Number(product.compareAtPrice) : null;
  const discount =
    compareAt && compareAt > price ? Math.round(((compareAt - price) / compareAt) * 100) : null;
  const href = `/products/${product.slug}`;

  return (
    // Not a <Link> wrapper: the card holds buttons, and interactive elements
    // cannot legally nest inside an anchor — it breaks keyboard navigation and
    // screen readers. A stretched overlay link keeps the image clickable.
    //
    // flex column + h-full so every card in a row is the same height and the
    // CTA sits on a shared baseline. Without it, the scarcity line ("Only a few
    // left") appears on some cards and not others, and their buttons visibly
    // fall out of line with the rest of the row.
    <div className={`group relative flex h-full flex-col ${CARD_SHELL_CLASS}`}>
      <div className={CARD_IMAGE_CLASS}>
        {image ? (
          <>
            <MaybeMorph name={morphName}>
              <Image
                src={image}
                alt={product.name}
                fill
                className={`object-cover transition-all duration-500 ease-out ${
                  hoverImage ? "group-hover:opacity-0" : "group-hover:scale-[1.04]"
                }`}
                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 400px"
              />
            </MaybeMorph>
            {hoverImage && (
              <Image
                src={hoverImage}
                alt=""
                aria-hidden
                fill
                loading="lazy"
                className="object-cover opacity-0 transition-opacity duration-500 ease-out group-hover:opacity-100"
                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 400px"
              />
            )}
          </>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No image
          </div>
        )}

        {/* nav-forward: going deeper into the catalogue. The direction is a
            judgement about hierarchy, not something Next can infer. */}
        <Link
          href={href}
          className="absolute inset-0 z-0"
          aria-label={product.name}
          transitionTypes={["nav-forward"]}
        />

        {/* All badges stack down the left so the wishlist heart owns the right
            corner alone. A sold-out piece shows only that — a discount on
            something unbuyable is noise. */}
        {/* Small letterspaced pills, the old store's shape. Not the shadcn
            Badge: that primitive is sized for admin tables and comes out twice
            this height over a photograph. */}
        <div className="absolute left-3 top-3 z-10 flex flex-col items-start gap-1.5">
          {product.stock <= 0 ? (
            <span className={`${CARD_PILL_CLASS} border bg-background/90 text-graphite-950 backdrop-blur-sm`}>
              Sold out
            </span>
          ) : (
            <>
              {discount !== null && discount > 0 && (
                <span className={`${CARD_PILL_CLASS} bg-brass text-graphite-950 shadow-sm`}>
                  {discount}% off
                </span>
              )}
              {product.isBestseller && (
                <span className={`${CARD_PILL_CLASS} bg-graphite-950/85 text-ivory-100 shadow-sm backdrop-blur-sm`}>
                  Bestseller
                </span>
              )}
            </>
          )}
        </div>

        {/* Always visible on a phone, where there is no hover to reveal it;
            revealed with the CTA from lg up. */}
        {showActions && (
          <div className="absolute right-3 top-3 z-10 transition-opacity duration-200 lg:opacity-0 lg:group-hover:opacity-100">
            <WishlistButton productId={product.id} iconOnly />
          </div>
        )}

        {/* Desktop: the CTA lives over the photograph and slides up on hover,
            so the resting card is a picture and a name and nothing else. This
            is the old store's card, and the reason its grid reads as a
            catalogue rather than a shelf of buttons.
            pointer-events only on hover, or an invisible button would swallow
            clicks meant for the link beneath it. */}
        {showActions && (
          <div className="pointer-events-none absolute inset-x-3 bottom-3 z-10 hidden translate-y-2 opacity-0 transition-all duration-300 ease-out group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100 lg:block">
            <AddToCartButton productId={product.id} stock={product.stock} compact />
          </div>
        )}
      </div>

      {/* The category eyebrow is gone: the old card carried a name and a price
          and nothing else, and every line removed from under the photograph is
          one the photograph gets back. Category is one tap away in the nav and
          on the product page. */}
      <div className="flex flex-1 flex-col space-y-2 px-4 pb-4 pt-3.5">
        <h3 className={`${CARD_TITLE_CLASS} text-graphite-950`}>
          <Link href={href} className="decoration-brass/60 underline-offset-4 hover:underline">
            {product.name}
          </Link>
        </h3>

        <div className="flex flex-wrap items-center gap-2">
          {/* text-foreground, NOT text-graphite-950: the ramp tokens are fixed
              values that don't flip with the theme, so a raw graphite price sat
              near-invisible on the dark background. */}
          <span className="text-base font-bold tracking-tight text-foreground">
            {formatINR(price)}
          </span>
          {compareAt && compareAt > price && (
            <span className="text-sm text-muted-foreground line-through">
              {formatINR(compareAt)}
            </span>
          )}
        </div>

        {/* Scarcity, never a count — see src/lib/stock-label.ts. */}
        {isScarce(product.stock) && (
          <p className="text-xs font-medium text-brass-text">{stockLabel(product.stock)}</p>
        )}

        {/* Mobile CTA. mt-auto pins it to the bottom of the card, so a scarcity
            line on one product doesn't shove its button out of line with the
            row. The lg copy above is the same component reading the same store,
            so the two never disagree — only one is ever visible. */}
        {showActions && (
          <div className="mt-auto pt-1 lg:hidden">
            <AddToCartButton productId={product.id} stock={product.stock} compact />
          </div>
        )}
      </div>
    </div>
  );
}
