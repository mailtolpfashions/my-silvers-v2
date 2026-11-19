import { test, expect, type Page } from "@playwright/test";
import { createTestProduct, deleteTestProduct } from "./helpers/db";
import { pieceAddButton } from "./helpers/ui";

/**
 * The phone's pinned bottom bar (StickyBarFrame), Nov 2026:
 *   - product and catalogue: the bar steps aside once the footer is in view,
 *     and comes back on scrolling up (owner: "stick those buttons up to the
 *     product page");
 *   - cart and checkout: the bar holds the only button, so it stays — and the
 *     page leaves room below the footer so nothing is ever under it.
 */

const bar = (page: Page) => page.locator("[data-sticky-action-bar]");
const onScreen = (page: Page) =>
  bar(page).evaluate((b) => b.getBoundingClientRect().top < window.innerHeight - 5);
const toEnd = (page: Page) => page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
const footerLineClear = (page: Page) =>
  page.evaluate(() => {
    const b = document.querySelector("[data-sticky-action-bar]")!.getBoundingClientRect();
    const items = [...document.querySelectorAll("footer p, footer a, footer li")].filter((e) => (e as HTMLElement).innerText.trim());
    return items[items.length - 1].getBoundingClientRect().bottom <= b.top + 1 || b.top >= window.innerHeight - 5;
  });

test.describe("phone bottom bar", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 1280) >= 768, "the bar exists on phones only");

  test("product page: the bar steps aside at the footer and returns on scrolling up", async ({ page }) => {
    const p = await createTestProduct({ stock: 2 });
    try {
      await page.goto(`/products/${p.slug}`);
      await expect(pieceAddButton(page)).toBeVisible({ timeout: 20_000 });
      await expect.poll(() => onScreen(page)).toBe(true);

      await toEnd(page);
      await expect.poll(() => onScreen(page), { message: "the bar still covers the footer" }).toBe(false);
      await expect(bar(page)).toHaveAttribute("inert", "");

      await page.evaluate(() => window.scrollTo(0, 0));
      await expect.poll(() => onScreen(page), { message: "the bar did not come back" }).toBe(true);
    } finally {
      await deleteTestProduct(p.id);
    }
  });

  test("cart: the bar stays at the footer, and the footer is still fully readable", async ({ page }) => {
    const p = await createTestProduct({ stock: 2 });
    try {
      await page.goto(`/products/${p.slug}`);
      await pieceAddButton(page).click();
      await expect(page.locator("[data-sonner-toast]").filter({ hasText: /added to cart/i }).first()).toBeVisible({ timeout: 20_000 });
      await page.goto("/cart");
      await expect(bar(page)).toHaveAttribute("data-sticky-action-bar", "pinned");
      await toEnd(page);
      await page.waitForTimeout(800);
      expect(await onScreen(page), "the cart's only checkout button left the screen").toBe(true);
      expect(await footerLineClear(page), "the footer's last line is under the bar").toBe(true);
    } finally {
      await deleteTestProduct(p.id);
    }
  });
});
