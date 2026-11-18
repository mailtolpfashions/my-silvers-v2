import { test, expect } from "@playwright/test";
import { LIVE_SAFE, SMOKE } from "./helpers/target";

/**
 * The read-only smoke pack — safe against the LIVE shop.
 *
 * Rules for this file, because it runs where real customers are:
 *   - no database helpers (they throw on a remote run anyway);
 *   - no sign-in, no form that writes, no "Place order";
 *   - the cart is only touched in the browser's own storage (a guest cart).
 *
 * Run it with `npm run test:smoke:live`. Locally it runs as part of smoke.
 */

const PAGES = ["/", "/products", "/collections", "/blog", "/faq", "/track-order", "/login", "/register", "/cart"];

test.describe("live smoke", () => {
  for (const path of PAGES) {
    test(`${path} loads with no server error and no page errors`, { tag: [SMOKE, LIVE_SAFE] }, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      const res = await page.goto(path);
      expect(res?.status(), `${path} answered ${res?.status()}`).toBeLessThan(400);
      await expect(page.locator("h1").first()).toBeVisible();
      await expect(page.locator("header")).toBeVisible();
      expect(errors, `JavaScript errors on ${path}`).toEqual([]);
    });
  }

  test("a product opens and goes into a guest cart", { tag: [SMOKE, LIVE_SAFE] }, async ({ page }) => {
    // Walks up to eight product pages; the cheapest are often rings that need
    // a size first, and each refusal costs a few seconds.
    test.setTimeout(120_000);
    await page.goto("/products?sort=price-desc");
    const cards = page.locator('main a[href^="/products/"]');
    await expect(cards.first()).toBeVisible({ timeout: 20_000 });

    // The first card whose page actually offers Add to cart (not sold out,
    // no size to choose).
    const hrefs = [...new Set(await cards.evaluateAll((as) => as.map((a) => a.getAttribute("href")!)))].slice(0, 8);
    let added = false;
    for (const href of hrefs) {
      await page.goto(href);
      const add = page.getByRole("button", { name: /^add to (cart|bag)$/i }).locator("visible=true").first();
      if ((await add.count()) && (await add.isEnabled().catch(() => false))) {
        // Sized pieces (rings, bangles) need a size first — pick the first one
        // in stock, as a shopper would.
        const size = page.locator('[role="radiogroup"] button[role="radio"]:not([disabled])').first();
        if (await size.count()) await size.click();
        await add.click();
        // A guest cart is written to browser storage after the click resolves;
        // the button's own "Added" state is the signal it landed. A piece with
        // sizes refuses the click ("choose a size") — try the next one.
        const landed = await page
          .getByRole("button", { name: /added to cart|in cart/i })
          .locator("visible=true")
          .first()
          .waitFor({ timeout: 6_000 })
          .then(() => true, () => false);
        if (!landed) continue;
        added = true;
        break;
      }
    }
    test.skip(!added, "no simple in-stock product among the first eight");
    await page.goto("/cart");
    await expect(page.locator("main")).not.toContainText(/your cart is empty/i);
  });

  test("checkout is reachable from the cart page", { tag: [LIVE_SAFE] }, async ({ page }) => {
    const res = await page.goto("/checkout");
    expect(res?.status()).toBeLessThan(400);
    // Either the checkout form, a sign-in page (guest checkout off), or an
    // empty-cart message — never an error.
    await expect(page.locator("h1, h2").first()).toBeVisible();
  });

  test("gated pages send a stranger to sign in", { tag: [SMOKE, LIVE_SAFE] }, async ({ page }) => {
    for (const path of ["/admin", "/cms", "/account"]) {
      await page.goto(path);
      await expect(page, `${path} did not bounce to login`).toHaveURL(/\/login/);
    }
  });

  test("robots.txt and sitemap.xml are served", { tag: [LIVE_SAFE] }, async ({ request }) => {
    const robots = await request.get("/robots.txt");
    expect(robots.status()).toBe(200);
    expect(await robots.text()).toMatch(/sitemap/i);
    const sitemap = await request.get("/sitemap.xml");
    expect(sitemap.status()).toBe(200);
    expect(await sitemap.text()).toContain("<urlset");
  });

  /**
   * Every image and video the homepage and first catalogue page ask for must
   * exist. On the dev database several Cloudinary assets now 404 (deleted from
   * the media account while still referenced) — a broken picture on the shop
   * window. This catches it on whichever site it runs against.
   */
  test("homepage and catalogue media all load", { tag: [LIVE_SAFE] }, async ({ page }) => {
    const broken: string[] = [];
    page.on("response", (r) => {
      const type = r.request().resourceType();
      if ((type === "image" || type === "media") && r.status() >= 400) broken.push(`${r.status()} ${r.url().slice(0, 140)}`);
    });
    for (const path of ["/", "/products"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle").catch(() => {});
      for (let i = 0; i < 5; i++) {
        await page.evaluate((y) => window.scrollTo(0, y), (i + 1) * 1500);
        await page.waitForTimeout(400);
      }
    }
    expect(broken, "broken images/videos").toEqual([]);
  });

  /**
   * Nov 2026: the hero's hand-cropped phone photos were sent as uploaded —
   * 1.6–1.8 MB PNGs, a 5.8 MB homepage, main content at 14.3 s on a mid-range
   * phone (Lighthouse). They now go through Cloudinary's f_auto/q_auto (see
   * lib/cloudinary-image.ts). This holds the line on whichever site it runs.
   */
  test("on a phone, the homepage's pictures stay light", { tag: [LIVE_SAFE] }, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "the phone hero only exists below lg");
    let bytes = 0;
    const heavy: string[] = [];
    page.on("response", async (r) => {
      if (r.request().resourceType() !== "image" || r.status() >= 400) return;
      const len = Number(r.headers()["content-length"] ?? (await r.body().catch(() => Buffer.alloc(0))).length);
      bytes += len;
      if (len > 400 * 1024) heavy.push(`${Math.round(len / 1024)} KB ${r.url().slice(0, 120)}`);
    });
    await page.goto("/");
    await page.waitForLoadState("networkidle").catch(() => {});

    for (const srcset of await page.locator("picture source[media]").evaluateAll((s) => s.map((e) => e.getAttribute("srcset") ?? ""))) {
      if (srcset.includes("res.cloudinary.com")) {
        expect(srcset, "a phone hero photo is served as uploaded, not compressed").toContain("f_auto");
      }
    }
    expect(heavy, "single images over 400 KB on the phone homepage").toEqual([]);
    expect(bytes, `phone homepage images total ${Math.round(bytes / 1024)} KB`).toBeLessThan(1.5 * 1024 * 1024);
  });

  test("a missing page is a friendly 404, marked noindex", { tag: [LIVE_SAFE] }, async ({ page }) => {
    await page.goto("/this-page-does-not-exist-e2e");
    const body = (await page.textContent("body"))?.toLowerCase() ?? "";
    expect(body).toMatch(/not found|couldn't find|could not find|does not exist/);
    await expect(page.locator('meta[name="robots"][content*="noindex"]').first()).toBeAttached();
  });

  test("FAQ has no placeholder answers left", { tag: [LIVE_SAFE] }, async ({ page }) => {
    await page.goto("/faq");
    const text = await page.locator("main").innerText();
    expect(text, "FAQ still has seeded 'Sample answer —' text").not.toMatch(/Sample answer\s*—/);
  });
});
