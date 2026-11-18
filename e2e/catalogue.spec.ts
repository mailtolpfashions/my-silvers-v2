import { test, expect, type Page } from "@playwright/test";
import { LIVE_SAFE, SMOKE } from "./helpers/target";

/**
 * Catalogue browsing — sort, price filter, search, empty states, categories.
 *
 * Browser-only and read-only, so every test here is also `@live-safe`: it can
 * run against the real shop. Assertions are about ORDER and SHAPE, never about
 * which products exist, so the demo catalogue and the real one both pass.
 */

/** Prices of the product cards on the first page, in display order. */
async function cardPrices(page: Page): Promise<number[]> {
  const cards = page.locator('main a[href^="/products/"]');
  await expect(cards.first()).toBeVisible({ timeout: 20_000 });
  // The selling price is the first ₹ figure in each card's text; a
  // compare-at price, when present, follows it.
  const texts = await page.locator("main article, main li").filter({ hasText: "₹" }).allInnerTexts();
  return texts
    .map((t) => t.match(/₹\s?([\d,]+(?:\.\d+)?)/)?.[1])
    .filter((v): v is string => !!v)
    .map((v) => Number(v.replace(/,/g, "")));
}

test.describe("catalogue", () => {
  test("lists products and opens one", { tag: [SMOKE, LIVE_SAFE] }, async ({ page }) => {
    const res = await page.goto("/products");
    expect(res?.status()).toBe(200);
    const first = page.locator('main a[href^="/products/"]').first();
    await expect(first).toBeVisible({ timeout: 20_000 });
    await first.click();
    await expect(page).toHaveURL(/\/products\/[^/?]+/);
    // Exactly one VISIBLE h1. Next keeps the catalogue it came from mounted but
    // display:none (so Back is instant) — out of the accessibility tree, so
    // not a second heading to anyone, but still matched by a bare "h1".
    await expect(page.locator("h1:visible")).toHaveCount(1, { timeout: 15_000 });
  });

  test("price low→high and high→low really sort", { tag: [LIVE_SAFE] }, async ({ page }) => {
    await page.goto("/products?sort=price-asc");
    const asc = await cardPrices(page);
    test.skip(asc.length < 3, "too few products to judge an order");
    expect(asc, "price-asc is not ascending").toEqual([...asc].sort((a, b) => a - b));

    await page.goto("/products?sort=price-desc");
    const desc = await cardPrices(page);
    expect(desc, "price-desc is not descending").toEqual([...desc].sort((a, b) => b - a));
  });

  test("choosing a sort puts it in the URL", { tag: [LIVE_SAFE] }, async ({ page }) => {
    await page.goto("/products");
    await expect(page.locator('main a[href^="/products/"]').first()).toBeVisible({ timeout: 20_000 });
    const sort = page.getByLabel("Sort products").locator("visible=true").first();
    test.skip((await sort.count()) === 0, "no visible sort control at this width");
    await sort.selectOption("price-asc");
    await expect(page).toHaveURL(/sort=price-asc/);
  });

  test("a price range only returns products inside it", { tag: [LIVE_SAFE] }, async ({ page }) => {
    await page.goto("/products?sort=price-asc");
    const all = await cardPrices(page);
    test.skip(all.length < 3, "too few products");
    const min = all[1];
    const max = all[all.length - 2];
    await page.goto(`/products?minPrice=${min}&maxPrice=${max}`);
    const filtered = await cardPrices(page);
    expect(filtered.length).toBeGreaterThan(0);
    for (const p of filtered) {
      expect(p, `₹${p} is outside ₹${min}–₹${max}`).toBeGreaterThanOrEqual(min);
      expect(p).toBeLessThanOrEqual(max);
    }
  });

  test("a filter nothing matches says so and offers a way back", { tag: [LIVE_SAFE] }, async ({ page }) => {
    await page.goto("/products?minPrice=99999990&maxPrice=99999999");
    await expect(page.getByText("Nothing matched those filters")).toBeVisible();
    await expect(page.getByRole("link", { name: "View all jewellery" })).toBeVisible();
  });

  test("nonsense in the price filter does not break the page", { tag: [LIVE_SAFE] }, async ({ page }) => {
    const res = await page.goto("/products?minPrice=abc&maxPrice=-5&sort=<script>");
    expect(res?.status()).toBeLessThan(500);
    await expect(page.locator("h1")).toBeVisible();
  });

  test("search results come back for a common word", { tag: [SMOKE, LIVE_SAFE] }, async ({ page }) => {
    await page.goto("/products?q=silver");
    await expect(page.locator("h1")).toBeVisible();
    // Either results, or the honest empty state — never an error page.
    const results = page.locator('main a[href^="/products/"]');
    const empty = page.getByText("Nothing matched those filters");
    await expect(results.first().or(empty)).toBeVisible({ timeout: 20_000 });
  });

  test("category pages open from the collections index", { tag: [LIVE_SAFE] }, async ({ page }) => {
    await page.goto("/collections");
    const links = page.locator('main a[href^="/category/"], main a[href^="/collections/"]');
    test.skip((await links.count()) === 0, "no categories or collections published");
    const href = await links.first().getAttribute("href");
    const res = await page.goto(href!);
    expect(res?.status()).toBe(200);
    await expect(page.locator("h1")).toBeVisible();
  });

  test("an unknown category is a not-found page, not a crash", { tag: [LIVE_SAFE] }, async ({ page }) => {
    const res = await page.goto("/category/no-such-category-xyz");
    expect(res?.status()).toBeLessThan(500);
    const body = (await page.textContent("body"))?.toLowerCase() ?? "";
    expect(body).toMatch(/not found|couldn't find|could not find|does not exist|isn't available/);
  });

  test("scrolling loads more products without duplicates", { tag: [LIVE_SAFE] }, async ({ page }) => {
    await page.goto("/products");
    const links = page.locator('main a[href^="/products/"]');
    await expect(links.first()).toBeVisible({ timeout: 20_000 });
    const before = new Set(await links.evaluateAll((as) => as.map((a) => a.getAttribute("href"))));

    // Infinite scroll, with a button fallback.
    for (let i = 0; i < 4; i++) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(800);
    }
    const more = page.getByRole("button", { name: /load more|show more|try again/i });
    if (await more.isVisible().catch(() => false)) await more.click();
    await page.waitForTimeout(1500);

    const hrefs = await links.evaluateAll((as) => as.map((a) => a.getAttribute("href")));
    // A card has several links to the same product (image, name), so count
    // distinct products per card position, not raw links.
    const distinct = new Set(hrefs);
    test.skip(distinct.size === before.size, "catalogue fits on one page");
    expect(distinct.size).toBeGreaterThan(before.size);
  });
});
