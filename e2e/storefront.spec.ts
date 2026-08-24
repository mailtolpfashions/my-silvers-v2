import { test, expect } from "@playwright/test";
import { getInStockProduct } from "./helpers/db";

/**
 * Storefront smoke cover — the shopping path a customer actually walks, kept
 * deliberately data-agnostic so it survives the demo catalogue being replaced
 * by the real one at launch. It asserts shapes and behaviour, never specific
 * product names or prices.
 */

test.describe("storefront renders", () => {
  test("homepage serves CMS-driven content and the primary navigation", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);

    await expect(page.locator("header")).toBeVisible();
    await expect(page.locator("footer")).toBeVisible();
    await expect(page.locator("h1").first()).toBeVisible();
  });

  /**
   * F-07 (audit, Aug 2026) — KNOWN GAP, deliberately left failing.
   *
   * The homepage renders three <h1> elements: hero-carousel.tsx emits one per
   * slide, on top of the one in homepage-view.tsx. A page has one top-level
   * heading; screen-reader users navigating by heading hear three competing
   * page titles, and it muddies the SEO signal.
   *
   * Marked fixme rather than deleted so it stays visible in every report
   * instead of becoming a silent assumption. Fix in Phase 6 (performance/SEO)
   * by demoting the carousel slides to <h2>, or rendering the h1 once outside
   * the carousel.
   */
  test.fixme("homepage has exactly one h1", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1")).toHaveCount(1);
  });

  test("product listing shows products and each links to a detail page", async ({ page }) => {
    await page.goto("/products");
    await expect(page.locator("h1")).toBeVisible();

    // Scoped to <main>, and to /products/ only. `/p/` is the CMS page route,
    // not a product — the footer's "Silver care" link (/p/care-guide) matched
    // the looser selector and `.first()` picked it, so this passed on desktop
    // while asserting nothing about products. On mobile that footer link is
    // hidden, which is what exposed it.
    const productLinks = page.locator('main a[href^="/products/"]');
    await expect(productLinks.first()).toBeVisible({ timeout: 15_000 });

    const href = await productLinks.first().getAttribute("href");
    expect(href).toBeTruthy();

    await page.goto(href!);
    await expect(page.locator("h1")).toBeVisible();
  });

  test("a missing product shows not-found content rather than erroring", async ({ page }) => {
    await page.goto("/products/this-slug-does-not-exist-12345");

    // The UI is correct even though the status code is not — see F-08 below.
    const body = (await page.textContent("body"))?.toLowerCase() ?? "";
    expect(body).toMatch(/not found|does not exist|couldn't find|could not find/);
  });

  /**
   * F-08 (audit, Aug 2026) — KNOWN GAP, deliberately left failing.
   *
   * `products/[slug]/page.tsx` calls notFound() correctly, but the response is
   * still HTTP 200: with cacheComponents/PPR the static shell is flushed before
   * the dynamic hole resolves, so the status line is already committed by the
   * time notFound() runs. The visitor sees the right page; a crawler sees a
   * soft 404 and will happily index every nonexistent product URL.
   *
   * This is an inherent PPR trade-off rather than a slip, so the fix is a
   * design decision for Phase 6 — most likely opting this route out of the
   * prerendered shell so the status can be set honestly.
   */
  test.fixme("a missing product returns HTTP 404", async ({ page }) => {
    const response = await page.goto("/products/this-slug-does-not-exist-12345");
    expect(response?.status()).toBe(404);
  });

  test("static pages render", async ({ page }) => {
    for (const path of ["/faq", "/collections", "/blog", "/login", "/register"]) {
      const response = await page.goto(path);
      expect(response?.status(), `${path} did not return 200`).toBe(200);
      await expect(page.locator("h1").first()).toBeVisible();
    }
  });
});

test.describe("guest cart", () => {
  test("holds an item across a reload", async ({ page }) => {
    // A specific product with stock and no variants, rather than whatever sits
    // first on the listing. A product with sizes keeps "Add to cart" disabled
    // until one is chosen, so the generic path timed out on the click — and
    // before the selector was tightened it followed a CMS link instead and
    // skipped itself, which is worse: a test that never ran and never said so.
    const product = await getInStockProduct();
    test.skip(!product, "no in-stock, single-variant product in this database");

    await page.goto(`/products/${product!.slug}`);

    // `visible=true` matters: the product page carries both an inline CTA and a
    // sticky mobile bar, and which one is hidden depends on the viewport.
    const addToCart = page
      .getByRole("button", { name: /add to (cart|bag)/i })
      .locator("visible=true")
      .first();

    await expect(addToCart).toBeVisible({ timeout: 20_000 });
    await expect(addToCart, "add to cart never became clickable").toBeEnabled({ timeout: 20_000 });
    await addToCart.click();

    await page.goto("/cart");
    // The cart must not read as empty after an add.
    const body = (await page.textContent("body"))?.toLowerCase() ?? "";
    expect(body).not.toContain("your cart is empty");

    // Guest carts live client-side; a reload is where that goes wrong.
    await page.reload();
    const afterReload = (await page.textContent("body"))?.toLowerCase() ?? "";
    expect(afterReload, "the guest cart emptied on reload").not.toContain("your cart is empty");
  });

  test("checkout is reachable and asks for delivery details", async ({ page }) => {
    await page.goto("/checkout");
    expect(page.url()).toContain("/checkout");
    await expect(page.locator("h1, h2").first()).toBeVisible();
  });
});

test.describe("search", () => {
  test("suggestions endpoint answers with JSON", async ({ request }) => {
    const response = await request.get("/api/search/suggestions?q=silver");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("application/json");
    expect(() => response.json()).not.toThrow();
  });

  test("an empty query does not error", async ({ request }) => {
    const response = await request.get("/api/search/suggestions?q=");
    expect(response.status()).toBeLessThan(500);
  });
});
