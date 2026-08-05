import { ViewTransition } from "react";
import Link from "next/link";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { stockLabel, isScarce } from "@/lib/stock-label";
import { formatINR } from "@/lib/format";
import { AddToCartButton } from "@/components/storefront/add-to-cart-button";
import { WishlistButton } from "@/components/storefront/wishlist-button";
import type { ProductListItem } from "@/server/products/search";

/**
 * Geometry shared with product-card-skeleton.tsx. Imported rather than copied
 * so the placeholder cannot drift from the real card and start causing layout
 * shift as streamed grids resolve.
 */
/**
 * 4:5 portrait rather than square. Jewellery is photographed tall — a pendant
 * on a chain, a stack of bangles — and a square crop either wastes the sides or
 * cuts the piece off. This is the single biggest change to how the grid reads.
 */
export const CARD_IMAGE_CLASS = "relative aspect-[4/5] overflow-hidden rounded-md bg-muted";
export const CARD_TITLE_CLASS = "line-clamp-2 min-h-[3rem] text-base leading-snug";

/**
 * The one product grid. Every listing imports this — the catalogue, category
 * pages, wishlist, cart recommendations, homepage sections and the loading
 * skeletons — so a card is the same size wherever a shopper meets it.
 *
 * Four columns is the ceiling, for two reasons. Jewellery is small and detailed:
 * shrinking the card to fit a fifth column costs the shopper the ability to
 * actually see the piece. And the CMS section limits are 8 and 12 — both
 * divisible by four, neither by five — so a five-column grid leaves every
 * homepage section with a ragged final row.
 */
export const PRODUCT_GRID_CLASS =
  "grid grid-cols-2 gap-x-5 gap-y-10 sm:grid-cols-3 lg:grid-cols-4";

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
    <div className="group relative flex h-full flex-col">
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
        <div className="absolute left-3 top-3 z-10 flex flex-col items-start gap-1.5">
          {product.stock <= 0 ? (
            <Badge variant="secondary">Out of stock</Badge>
          ) : (
            <>
              {discount !== null && discount > 0 && (
                <Badge className="bg-brass text-graphite-950 hover:bg-brass">
                  {discount}% off
                </Badge>
              )}
              {product.isBestseller && (
                <Badge className="bg-graphite-950/85 text-ivory-100 backdrop-blur-sm hover:bg-graphite-950/85">
                  Bestseller
                </Badge>
              )}
            </>
          )}
        </div>

        {showActions && (
          <div className="absolute right-2 top-2 z-10">
            <WishlistButton productId={product.id} iconOnly />
          </div>
        )}
      </div>

      {/* Quieter than before: the photography should carry the card, so the
          category eyebrow is small and grey rather than a brass shout, and the
          price sits at body weight instead of competing with the heading. */}
      <div className="mt-3.5 flex flex-1 flex-col space-y-1">
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
          {product.categoryName}
        </p>
        <h3 className={`${CARD_TITLE_CLASS} text-foreground`}>
          <Link href={href} className="decoration-brass/60 underline-offset-4 hover:underline">
            {product.name}
          </Link>
        </h3>
        <div className="flex flex-wrap items-baseline gap-2 pt-0.5">
          {/* text-foreground, NOT text-graphite-950: the ramp tokens are fixed
              values that don't flip with the theme, so a raw graphite price sat
              near-invisible on the dark background. */}
          <span className="text-xl font-semibold tracking-tight text-foreground">
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
          <p className="text-sm font-medium text-brass-text">{stockLabel(product.stock)}</p>
        )}

        {/* mt-auto pins the CTA to the bottom of the card, so a scarcity line on
            one product doesn't shove its button out of line with the row. */}
        {showActions && (
          <div className="mt-auto pt-4">
            <AddToCartButton productId={product.id} stock={product.stock} compact />
          </div>
        )}
      </div>
    </div>
  );
}
