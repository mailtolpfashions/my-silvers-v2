/**
 * Geometry and type shared by the product card, its skeleton, and the buttons
 * that render inside it.
 *
 * A plain module rather than exports on product-card.tsx, because
 * add-to-cart-button.tsx needs the CTA class and is a client component: an
 * import the other way would both form a cycle and drag a server component's
 * module graph into the browser bundle. Nothing here imports React.
 *
 * The values are the previous MY Silvers storefront's card, ported deliberately
 * — see the notes on each.
 */

/**
 * Square, matching the old store. This reverses the 4:5 portrait crop — a
 * deliberate reversal, made because the old card is the reference for how this
 * grid should feel, not because portrait was wrong. If the photography is ever
 * reshot tall, the ratio here is the one line to change.
 */
export const CARD_IMAGE_CLASS = "relative aspect-square overflow-hidden bg-muted";

/**
 * The name is set in Playfair, not the body sans. This is the single loudest
 * signal in the whole design: a serif product name at 15px reads as a catalogue
 * entry, the same words in 16px sans read as a search result.
 */
export const CARD_TITLE_CLASS =
  "line-clamp-2 min-h-[2.75rem] font-heading text-[15px] leading-snug tracking-[-0.01em]";

/** The card's own frame — white surface, hairline edge, 20px corners. */
export const CARD_SHELL_CLASS = "overflow-hidden rounded-[var(--radius-card)] border bg-card";

/**
 * The uppercase micro-label used on card CTAs.
 *
 * 11px at 0.15em tracking. Small type that has been given room is the oldest
 * trick in luxury retail, and it is why the old store's "Add to Bag" read as
 * expensive where a 16px sentence-case pill reads as a supermarket.
 */
export const CARD_CTA_CLASS =
  "w-full rounded-md py-3 text-[11px] font-semibold uppercase tracking-[0.15em]";

/** Badge pills over the photograph — 9px, letterspaced, uppercase. */
export const CARD_PILL_CLASS =
  "rounded-full px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.2em]";

/**
 * The one product grid. Every listing uses this — the catalogue, category
 * pages, wishlist, cart recommendations, homepage sections and the loading
 * skeletons — so a card is the same size wherever a shopper meets it.
 *
 * Four columns is the ceiling, for two reasons. Jewellery is small and
 * detailed: shrinking the card to fit a fifth column costs the shopper the
 * ability to actually see the piece. And the CMS section limits are 8 and 12 —
 * both divisible by four, neither by five — so a five-column grid leaves every
 * homepage section with a ragged final row.
 *
 * Gaps are the old store's 12px / 20px, not the 16–40px this had. A borderless
 * card needs whitespace to be read as a unit; a bordered one carries its own
 * edge, and the same generous gutter then reads as cards adrift on the page.
 */
export const PRODUCT_GRID_CLASS =
  "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 lg:gap-5";
