/**
 * Placeholder for HeaderAccount while it streams.
 *
 * The three boxes are `size-12` to match the header's icon buttons, which
 * override `Button size="icon"` (32px) up to 48px via className — the shared
 * variant is left alone so admin buttons keep their compact sizing. If the two
 * drift apart the header shifts as the island resolves. Change both or neither.
 *
 * The Admin/CMS links are intentionally absent: they are `hidden lg:inline-flex`
 * and only render for staff, so reserving space for them would shift the header
 * for every ordinary shopper to spare a shift for a handful of admins.
 *
 * The account glyph IS reserved, but only from lg — it is `hidden lg:inline-flex`
 * in HeaderAccount, because below that the drawer carries the route instead.
 * Reserving it on a phone would leave a 40px hole that never fills.
 */
export function HeaderAccountSkeleton() {
  return (
    <>
      {/* Account. Matches its button's breakpoint exactly; if one moves, move
          both or the header jumps as this island resolves. */}
      <div className="hidden size-10 md:size-11 lg:block" aria-hidden />
      {/* Wishlist and cart, at every width. */}
      {Array.from({ length: 2 }, (_, i) => (
        <div key={i} className="size-10 md:size-11" aria-hidden />
      ))}
      <span className="sr-only">Loading account</span>
    </>
  );
}
