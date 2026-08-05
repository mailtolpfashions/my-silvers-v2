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
export const STICKY_BAR_SPACER = "pb-28 md:pb-0";

export function StickyActionBar({ children }: { children: React.ReactNode }) {
  return (
    <div
      // z-40 matches the header rather than exceeding it: a drawer or dialog
      // (z-50) must still cover this.
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:hidden"
      // The iPhone home indicator sits over the bottom ~34px. Without this the
      // buttons are under it and the last few pixels are unreachable.
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex items-center gap-3 px-4 py-3">{children}</div>
    </div>
  );
}
