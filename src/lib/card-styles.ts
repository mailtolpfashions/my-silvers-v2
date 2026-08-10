/**
 * Geometry and type shared by the product card, its skeleton, and anything that
 * lays out a product grid.
 *
 * A plain module rather than exports on product-card.tsx, because client
 * components need these classes and an import the other way would both form a
 * cycle and drag a server component's module graph into the browser bundle.
 * Nothing here imports React.
 */

/**
 * 4:5 portrait.
 *
 * This reverses the square crop, which was chosen to match the PREVIOUS MY
 * Silvers storefront rather than anything about the photography. Jewellery is a
 * tall subject — a pendant on a chain, a ring stack, a pair of drops — and a
 * square frame either crops it or floats it in dead space. Portrait also buys
 * roughly 25% more image height per grid row at the same column width, which is
 * the cheapest way to make the photography the loudest thing on the page.
 *
 * If the catalogue is ever reshot to a different ratio, this is the one line.
 */
export const CARD_IMAGE_CLASS = "relative aspect-[4/5] overflow-hidden bg-muted";

/**
 * 14px, weight 500, in the body sans — the product name.
 *
 * No serif on the card. A serif product name reads as heritage where this brand
 * wants modern, and it puts character into the UI instead of into the
 * photography. The serif is scoped to the journal and the story block; see
 * story-section.tsx.
 */
export const CARD_TITLE_CLASS = "line-clamp-2 min-h-[2.625rem] text-sm font-medium leading-[1.5]";

/**
 * The card's frame — and there is deliberately almost nothing to it.
 *
 * No border, no radius, no shadow. A run of borderless tiles reads as a row of
 * photographs; the same tiles with rules around them read as a row of
 * containers, and containers are what make a grid look like a shelf.
 *
 * `bg-muted` rather than `bg-card`: the tile is a backdrop for the object, not
 * a card sitting on the page.
 */
export const CARD_SHELL_CLASS = "overflow-hidden bg-muted";

/**
 * The one product grid. Every listing uses this — the catalogue, category
 * pages, collections, wishlist, cart recommendations, homepage sections and the
 * loading skeletons — so a card is the same size wherever a shopper meets it.
 *
 * Four columns is the ceiling. Jewellery is small and detailed: shrinking the
 * card to fit a fifth column costs the shopper the ability to see the piece.
 * And the CMS section limits are 8 and 12 — both divisible by four, neither by
 * five — so a five-column grid leaves every homepage section with a ragged
 * final row.
 *
 * No gaps between columns from sm up. The row reads as one continuous band of
 * photography rather than four objects with air between them; each tile carries
 * its own internal padding instead, so the space goes INSIDE the tile. A
 * single-pixel column gap remains on phones, where two touching tiles at that
 * width genuinely do read as one confusing block.
 */
export const PRODUCT_GRID_CLASS =
  "grid grid-cols-2 gap-x-px gap-y-8 sm:grid-cols-3 sm:gap-x-0 lg:grid-cols-4";
