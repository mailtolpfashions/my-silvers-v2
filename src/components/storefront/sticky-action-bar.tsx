import { StickyBarFrame } from "@/components/storefront/sticky-bar-frame";

/**
 * The fixed bottom action bar used on mobile.
 *
 * Only below md. On a phone the primary action would otherwise sit wherever the
 * shopper happens to have scrolled to — usually off screen, since a product page
 * is mostly photography and specifications. Pinning it means the decision is
 * always one tap away.
 *
 * Callers must reserve space for it, or the bar covers the last of the page.
 * `STICKY_BAR_SPACER` does that; it is a class rather than padding baked in here
 * because the bar is `fixed` and therefore out of flow — nothing it renders can
 * push the page.
 */
export const STICKY_BAR_SPACER =
  "pb-[calc(7rem+env(safe-area-inset-bottom))] md:pb-0";

/**
 * The same reservation as an element rather than a class, for pages whose
 * container already carries a bottom padding worth keeping on desktop —
 * `STICKY_BAR_SPACER` would flatten it with `md:pb-0`.
 */
export function StickyBarSpacer() {
  return (
    <div
      className="h-[calc(6rem+env(safe-area-inset-bottom))] md:hidden"
      aria-hidden
    />
  );
}

/**
 * The frame — fixed position, and stepping aside when the footer arrives —
 * lives in StickyBarFrame, a client component. Kept apart so this module stays
 * server-safe: pages import STICKY_BAR_SPACER from here, and a plain string
 * exported from a "use client" file would reach a server component as a client
 * reference, not as the string.
 */
export function StickyActionBar({
  children,
  stayOverFooter = false,
}: {
  children: React.ReactNode;
  /** Cart and checkout: the bar is the only button there — see StickyBarFrame. */
  stayOverFooter?: boolean;
}) {
  return (
    <StickyBarFrame stayOverFooter={stayOverFooter}>
      <div className="flex items-center gap-3 px-4 py-3">{children}</div>
    </StickyBarFrame>
  );
}
