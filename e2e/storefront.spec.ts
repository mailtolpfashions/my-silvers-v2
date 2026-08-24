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
   * F-08 (audit, Aug 2026) — FIXED, and held here.
   *
   * The hero carousel used to render an <h1> per slide, so a three-slide hero
   * gave the homepage three top-level headings: three competing page titles for
   * anyone navigating by heading, and a split SEO signal. The first slide keeps
   * the h1, the rest are h2.
   */
  test("homepage has exactly one h1", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1")).toHaveCount(1);
  });

  test("every storefront page has exactly one h1", async ({ page }) => {
    for (const path of ["/products", "/collections", "/blog", "/faq", "/cart"]) {
      await page.goto(path);
      await expect(page.locator("h1"), `${path} does not have exactly one h1`).toHaveCount(1);
    }
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
   * F-07 (audit, Aug 2026) — ACCEPTED, and this is the control that makes it
   * acceptable.
   *
   * A missing product answers HTTP 200, not 404: under cacheComponents/PPR the
   * static shell is flushed before the dynamic hole resolves, so the status
   * line is already committed by the time notFound() runs. That reads like a
   * soft 404 waiting to be indexed — except notFound() also injects
   * `<meta name="robots" content="noindex">`, which Google honours, so the
   * pages do not enter the index.
   *
   * Forcing the route dynamic would buy the honest status code at the cost of
   * the prerendered shell on the single most-visited page type on the site.
   * Not worth it. What IS worth guarding is the noindex tag, because that is
   * now the only thing standing between a typo'd URL and the index — so it is
   * asserted here rather than assumed.
   */
  test("a missing product is marked noindex, even though it answers 200", async ({ page }) => {
    const response = await page.goto("/products/this-slug-does-not-exist-12345");

    // Documented, not desired — see above. Asserted so that a future change to
    // 404 shows up as a deliberate decision rather than a silent drift.
    expect(response?.status()).toBe(200);

    await expect(
      page.locator('meta[name="robots"][content*="noindex"]').first(),
      "a missing product is indexable — notFound()'s noindex tag is gone"
    ).toBeAttached();
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
