import { ViewTransition } from "react";
import Link from "next/link";
import Image from "next/image";
import { stockLabel, isScarce } from "@/lib/stock-label";
import { formatINR } from "@/lib/format";
import { CARD_IMAGE_CLASS, CARD_TITLE_CLASS, CARD_SHELL_CLASS } from "@/lib/card-styles";
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
 * A product, as a photograph and its name.
 *
 * ── What this card deliberately does NOT show ────────────────────────────────
 * A discount pill, a bestseller pill, an "In stock" dot and an add-to-cart
 * button have all been removed. Each was individually defensible; together they
 * put six pieces of furniture on a tile whose whole thesis is a picture and a
 * name, and they are what made a grid of jewellery read as a shelf of offers.
 *
 * A black-filled percentage badge in particular is a discount sticker, and it
 * was the one place the palette's decorative accent was being used as a fill
 * behind text. The saving is still shown — as a struck-through compare-at price,
 * which is the quiet way to say the same thing.
 *
 * Scarcity survives, because for one-of-a-kind pieces it is genuine
 * information rather than pressure — but only when it says something. "In
 * stock" on every tile says nothing.
 *
 * ── Do not add per-shopper props ─────────────────────────────────────────────
 * Wishlist and cart membership used to arrive here as props, which made every
 * grid on the site different for every visitor and kept listing pages out of
 * the cache entirely. The wishlist button reads that state from the shared
 * client store instead — see src/lib/user-state-store.ts.
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
  const href = `/products/${product.slug}`;

  return (
    // Not a <Link> wrapper: the card holds a wishlist button, and interactive
    // elements cannot legally nest inside an anchor — it breaks keyboard
    // navigation and screen readers. A stretched overlay link keeps the image
    // clickable.
    <div className="group relative flex h-full flex-col">
      {/* The tile is the field; the words go below it on the page. That split
          is the point — a bordered box containing both reads as a card, an
          image with a caption under it reads as a catalogue. */}
      <div className={`${CARD_SHELL_CLASS} ${CARD_IMAGE_CLASS}`}>
        {image ? (
          <>
            <MaybeMorph name={morphName}>
              <Image
                src={image}
                alt={product.name}
                fill
                // A crossfade to the second angle, and nothing else. No scale,
                // no lift, no shadow — the picture should not react to the
                // cursor, it should simply show you more.
                className={`object-cover transition-opacity duration-500 ease-out ${
                  hoverImage ? "group-hover:opacity-0" : ""
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

        {/* Sold out is the one state still worth marking on the tile — a
            shopper who clicks through to an unbuyable piece has been wasted.
            A hairline label rather than a filled pill. */}
        {product.stock <= 0 && (
          <span className="absolute left-3 top-3 z-10 bg-background/90 px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-black backdrop-blur-sm">
            Sold out
          </span>
        )}

        {/* Always visible on a phone, where there is no hover to reveal it;
            revealed on hover from lg up. A low-commitment action that genuinely
            belongs on a grid — unlike add-to-cart, which does not. */}
        {showActions && (
          <div className="absolute right-2 top-2 z-10 transition-opacity duration-200 lg:opacity-0 lg:group-hover:opacity-100 lg:focus-within:opacity-100">
            <WishlistButton productId={product.id} iconOnly />
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col px-1 pt-4 sm:px-2">
        {/* The range, then the piece. It reads as a catalogue entry rather than
            a search result, and the category is the nearest thing this
            catalogue has to a maker's name. */}
        <p className="text-xs text-muted-foreground">{product.categoryName}</p>

        <h3 className={`${CARD_TITLE_CLASS} mt-1 text-foreground`}>
          <Link href={href} className="decoration-black/60 underline-offset-4 hover:underline">
            {product.name}
          </Link>
        </h3>

        <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          {/* 14px, regular weight. A price set quietly beside a large
              photograph reads as confidence; the same number at 16px bold
              reads as a discount sticker. */}
          <span className="text-sm text-foreground">{formatINR(price)}</span>
          {compareAt && compareAt > price && (
            <span className="text-xs text-muted-foreground line-through">
              {formatINR(compareAt)}
            </span>
          )}
        </div>

        {/* Only when it says something. "In stock" on every tile is noise; a
            piece with one left is information. Still never a count — see
            src/lib/stock-label.ts. */}
        {product.stock > 0 && isScarce(product.stock) && (
          <p className="mt-1.5 text-xs text-black">{stockLabel(product.stock)}</p>
        )}
      </div>
    </div>
  );
}
