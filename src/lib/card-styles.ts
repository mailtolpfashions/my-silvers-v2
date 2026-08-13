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
 * 1:1 square. ⚠️  Must match `.product-frame` in globals.css.
 *
 * ── One ratio, everywhere ────────────────────────────────────────────────────
 * This is the whole catalogue's crop: the grid tile here, the product page
 * gallery, its lightbox and the hover thumbnail rail. A shopper who taps a tile
 * and lands on the product page must see the same shaped photograph, and an
 * admin must be able to upload anything and get a uniform result. Two ratios in
 * that chain is a bug, not a style — if this line changes, `.product-frame`
 * changes with it in the same commit.
 *
 * ── Why square, having twice been 4:5 ────────────────────────────────────────
 * The argument for portrait was real and is worth stating, because it is what
 * you will rediscover if you change this back: jewellery is a tall subject, and
 * 4:5 buys about 25% more image height per grid row at the same column width.
 *
 * What decided it was the product page rather than the grid. There the frame's
 * HEIGHT is fixed — one photograph has to fit the window without scrolling —
 * so the ratio only decides how much of the column the picture fills. At 1920
 * that is a 735px height against a gallery column of roughly 900: 4:5 fills 588
 * of it and strands the rest, square fills 735. Square is simply the ratio that
 * spends a fixed height on the widest possible picture.
 *
 * The cost is paid in the crop, and it is not small: `object-cover` takes about
 * a third off the top and bottom of a 2:3 studio shot. Shoot to square and
 * nothing is lost.
 */
export const CARD_IMAGE_CLASS = "relative aspect-square overflow-hidden bg-muted";

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
 * ── Gaps, and the reversal ──────────────────────────────────────────────────
 * This grid used to run gapless from sm up — `gap-x-px sm:gap-x-0` — so a row
 * read as one continuous band of photography rather than four objects with air
 * between them, with each tile's own padding standing in for the space.
 *
 * That was written before the tiles carried a control. A per-tile add-to-cart
 * button changes what the row IS: four buttons at the same height in a gapless
 * band read as one segmented toolbar, and it stops being obvious which button
 * belongs to which photograph. The columns are separated now for that reason,
 * and the amount is the smallest that makes the pairing unambiguous.
 *
 * The spacing itself is no longer spelled out here. `.grid-gutter` in
 * globals.css owns it for every tiled section on the site — this grid, the
 * collection row, the editorial pair and the worldTiles band — because four
 * grids each inventing their own gap is precisely what put four different
 * column gaps on one homepage. Change it there, not here.
 */
export const PRODUCT_GRID_CLASS =
  "grid grid-cols-2 grid-gutter sm:grid-cols-3 lg:grid-cols-4";
