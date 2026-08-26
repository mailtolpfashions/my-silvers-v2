import { ViewTransition } from "react";
import Link from "next/link";
import Image from "next/image";
import { stockLabel, isScarce } from "@/lib/stock-label";
import { formatINR } from "@/lib/format";
import { CARD_IMAGE_CLASS, CARD_TITLE_CLASS, CARD_SHELL_CLASS } from "@/lib/card-styles";
import { WishlistButton } from "@/components/storefront/wishlist-button";
import { AddToCartButton } from "@/components/storefront/add-to-cart-button";
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
 * A discount pill, a bestseller pill and an "In stock" dot have all been
 * removed. Each was individually defensible; together they put six pieces of
 * furniture on a tile whose whole thesis is a picture and a name, and they are
 * what made a grid of jewellery read as a shelf of offers.
 *
 * The add-to-cart control came BACK, having been on that list. It is the one
 * exception, and it is drawn to stay one: a hairline outline under the price,
 * never a filled block, so the photograph is still the loudest thing on the
 * tile. Two thirds of this catalogue is sold in sizes and cannot be added from
 * a grid at all — those tiles say "Select size" and lead to the product page.
 * See the `card` and `requiresSize` props in add-to-cart-button.tsx.
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
  eager = false,
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
  /**
   * Load this tile's photograph immediately instead of lazily.
   *
   * ⚠️  Set it on the first row of every listing. next/image defaults to lazy,
   * and this card had no way to opt out — so the row a shopper was already
   * looking at on arrival waited for an intersection callback before it began
   * downloading. That is a large part of why the catalogue felt slow to render.
   *
   * ── `eager`, NOT `preload` — they are different props ───────────────────────
   * CollectionCard and EditorialTile take a `preload` prop and describe it as
   * "above-the-fold tiles only", which reads like this. It is not the same
   * thing, and next/image's own docs are explicit: `preload` ONLY inserts a
   * `<link rel="preload">` into <head>, and "in most cases you should use
   * loading='eager' or fetchPriority='high' instead". It leaves the <img> at
   * `loading="lazy"`.
   *
   * On a streamed page it does even less than that. A <link> has to reach
   * <head>, and under Cache Components most of this storefront renders after
   * the head has flushed — the product page's own LCP image carries `preload`
   * and emits no link tag at all.
   *
   * So this prop is named for what it does. Do not "align" it with the others;
   * align the others with it.
   *
   * First row only. Marking a 120-product catalogue eager removes lazy loading
   * from the whole thing and floods the connection — the same problem pointed
   * the other way.
   */
  eager?: boolean;
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
                loading={eager ? "eager" : "lazy"}
                // Only the tiles we are asking for early get the priority hint;
                // handing it to every image is the same as handing it to none.
                fetchPriority={eager ? "high" : undefined}
                // A blurred preview instead of a flat grey box while the
                // photograph downloads — the difference a fast scroll actually
                // feels. Conditional because the data URI is best-effort: no
                // Cloudinary source, or a CDN blip, and it is simply absent.
                // `placeholder="blur"` without a blurDataURL throws.
                {...(product.blurDataUrl
                  ? { placeholder: "blur" as const, blurDataURL: product.blurDataUrl }
                  : {})}
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
          <span className="absolute left-3 top-3 z-10 bg-background/90 px-2.5 py-1 text-micro uppercase tracking-[0.14em] text-black backdrop-blur-sm">
            Sold out
          </span>
        )}

        {/* Always visible on a phone, where there is no hover to reveal it;
            revealed on hover from lg up. A low-commitment action that genuinely
            belongs on a grid — unlike add-to-cart, which does not. */}
        {showActions && (
          <div className="absolute right-2 top-2 z-10 transition-opacity duration-200 lg:opacity-0 lg:group-hover:opacity-100 lg:focus-within:opacity-100">
            <WishlistButton productId={product.id} />
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col px-1 pt-4 sm:px-2">
        {/* ── The price leads, and the category line is gone ──────────────────
            This block used to read category → name → price, with the price set
            quietly at regular weight on the theory that a number shown softly
            beside a large photograph reads as confidence.

            That is a European department-store assumption and this catalogue
            does not sell into one. In the Indian market the price is the first
            thing a shopper wants from a tile, so it is now the first thing the
            tile says — and it carries the extra weight, because position alone
            does not lead when the line under it is longer and darker.

            The category went with it. "Pendants" above a pendant, on a page the
            shopper reached by tapping Pendants, spent the tile's most valuable
            line saying nothing — and it was pushing the price down to third. */}
        {/* The hallmark. 925 is stamped into every piece this shop sells, so it
            is reproduced rather than described — the assay mark is the argument
            for the price against plated silver that photographs identically,
            and it belongs where the price is. See .hallmark in globals.css. */}
        <p className="hallmark mb-1">925 · Sterling</p>

        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          {/* 16px semibold — one step up from the 14px name below it, so the
              number leads the tile on size as well as on position.

              .numeral sets it in the mono: a measured figure in the voice of a
              stamp, and tabular so a row of tiles lines its prices up. */}
          <span className="figures text-base font-semibold text-foreground">
            {formatINR(price)}
          </span>
          {compareAt && compareAt > price && (
            <span className="figures text-sm text-muted-foreground line-through">
              {formatINR(compareAt)}
            </span>
          )}
          {/* ⚠️  This reverses a decision recorded above — that the saving stays
              implicit, shown "as a struck-through compare-at price, which is
              the quiet way to say the same thing".

              Quiet is right for a Western catalogue and wrong here. A struck
              figure asks the shopper to do the subtraction, and most will not;
              every shop that competes for this basket — Tanishq, CaratLane,
              GIVA — states the saving outright, because in Indian retail it is
              the most persuasive line on a tile.

              It is still not a badge. No fill, no percentage sticker, no red:
              one line of accent text stating a fact the shopper would otherwise
              have to work out. The pills that note warns about stay gone. */}
          {compareAt && compareAt > price && (
            <span className="saving">Save {formatINR(compareAt - price)}</span>
          )}
        </div>

        <h3 className={`${CARD_TITLE_CLASS} mt-1.5 text-foreground`}>
          <Link href={href} className="decoration-black/60 underline-offset-4 hover:underline">
            {product.name}
          </Link>
        </h3>

        {/* Only when it says something. "In stock" on every tile is noise; a
            piece with one left is information. Still never a count — see
            src/lib/stock-label.ts. */}
        {product.stock > 0 && isScarce(product.stock) && (
          <p className="mt-1.5 text-xs text-black">{stockLabel(product.stock)}</p>
        )}

        {/* `mt-auto` pins this to the foot of the card, so a row of buttons
            lines up across tiles whose names wrap to different heights — the
            grid's `h-full` and this column's `flex-1` exist for exactly that.
            Above the fold of the tile it would be furniture; at the bottom it
            is the last thing read, which is where an action belongs. */}
        {showActions && (
          <div className="mt-auto pt-3">
            <AddToCartButton
              card
              productId={product.id}
              stock={product.stock}
              requiresSize={product.requiresSize}
              href={href}
            />
          </div>
        )}
      </div>
    </div>
  );
}
