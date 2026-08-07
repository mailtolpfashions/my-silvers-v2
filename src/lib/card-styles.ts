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
 * 14px, weight 500, in the body sans — the reference's product-name size.
 *
 * The serif is gone from the card. It was the loudest signal in the previous
 * pass and it is the wrong one for this target: the reference sets every
 * product name in the same geometric sans as its body copy, and reserves any
 * character at all for the photography. A serif name here reads as heritage
 * where this design wants modern.
 */
export const CARD_TITLE_CLASS =
  "line-clamp-2 min-h-[2.625rem] text-sm font-medium leading-[1.5]";

/**
 * The card's frame — and there is deliberately almost nothing to it.
 *
 * The border and the 20px corners are gone. On the reference site the product
 * row is a run of borderless tiles touching edge to edge, each a flat grey
 * field with the piece floating in the middle of it: no rule, no radius, no
 * shadow. The effect is that the eye reads a row of photographs rather than a
 * row of containers, and it is most of why that grid looks expensive.
 *
 * `bg-muted` rather than `bg-card` for the same reason — the tile is a backdrop
 * for the object, not a card sitting on the page.
 */
export const CARD_SHELL_CLASS = "overflow-hidden bg-muted";

/**
 * The uppercase label used on card CTAs.
 *
 * The reference's own action link is 14px uppercase at 0.03em — barely tracked,
 * and square-cornered rather than a pill. The heavily letterspaced 11px version
 * this replaces belonged to the previous target; at 0.15em it read as a luxury
 * pastiche rather than the thing itself.
 */
export const CARD_CTA_CLASS =
  "w-full rounded-none py-3 text-[13px] font-normal uppercase tracking-[0.03em]";

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
 * No gaps between columns from sm up, and this is the deliberate part. The
 * reference site runs its product tiles hard against each other so the row
 * reads as one continuous band of photography rather than four objects with
 * air between them. Each tile carries its own generous internal padding
 * instead, which is what gives the piece room — the space goes INSIDE the
 * tile rather than between tiles.
 *
 * A single-pixel column gap remains on phones, where two touching tiles at
 * that width genuinely do read as one confusing block.
 */
export const PRODUCT_GRID_CLASS =
  "grid grid-cols-2 gap-px sm:grid-cols-3 sm:gap-0 lg:grid-cols-4";
