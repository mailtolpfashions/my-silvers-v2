import type { Page, Locator } from "@playwright/test";

/**
 * The product page's OWN "Add to cart" — the one in the buy box beside the
 * piece's h1.
 *
 * ⚠️  Never `getByRole("button", { name: /add to cart/ }).first()`. A product
 * page also shows other products (recently viewed, recommendations) with their
 * own Add to cart buttons, and depending on layout and timing one of those can
 * come first. Tests that did this sometimes ordered a DEMO piece instead of
 * the test's own: the race test reported "sold twice" when one buyer was
 * really buying a different pendant, a vendor check failed, and the demo
 * catalogue quietly lost stock with every run.
 */
export function pieceAddButton(page: Page): Locator {
  const name = /^add to (cart|bag)$/i;
  // The h1's own column (its parent) — and NEVER wider. An earlier version
  // climbed to "the nearest ancestor holding an Add to cart button"; while the
  // piece's own button briefly read something else (hydrating, "Adding…"),
  // that ancestor became <main>, and .first() caught a recommendation card's
  // button. Under a busy parallel run that was another test's product.
  const buyBox = page
    .locator("h1:visible")
    .first()
    .locator("xpath=..")
    .getByRole("button", { name })
    .locator("visible=true");
  // On a phone the buy box's button can be hidden in favour of the pinned bar
  // at the foot of the screen (StickyActionBar — fixed, bottom-0, md:hidden).
  const stickyBar = page.locator("div.fixed.bottom-0").getByRole("button", { name }).locator("visible=true");
  return buyBox.or(stickyBar).first();
}
