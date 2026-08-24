import { test, expect, type Page } from "@playwright/test";
import { getInStockProduct } from "./helpers/db";

/**
 * What a crawler sees.
 *
 * None of this is visible in the browser, which is exactly why it rots without
 * being noticed: a canonical that never got added, an OG image that broke when
 * a component moved, a JSON-LD blob that stopped being valid JSON. Every
 * assertion here is something a person would only discover weeks later, in
 * Search Console or a bad-looking WhatsApp preview.
 */

async function metaContent(page: Page, selector: string): Promise<string | null> {
  const el = page.locator(selector).first();
  return (await el.count()) ? el.getAttribute("content") : null;
}

test.describe("page metadata", () => {
  const PAGES = ["/", "/products", "/collections", "/blog", "/faq"];

  test("every public page has a title and a description", async ({ page }) => {
    for (const path of PAGES) {
      await page.goto(path);

      const title = await page.title();
      expect(title.trim(), `${path} has no <title>`).not.toBe("");
      // Google truncates around 60; well past that means it was never written
      // for search, just concatenated.
      expect(title.length, `${path} title is suspiciously long`).toBeLessThan(120);

      const description = await metaContent(page, 'meta[name="description"]');
      expect(description?.trim(), `${path} has no meta description`).toBeTruthy();
    }
  });

  test("titles are distinct from one another", async ({ page }) => {
    const titles = new Map<string, string>();
    for (const path of PAGES) {
      await page.goto(path);
      titles.set(path, await page.title());
    }

    // Every page sharing one title is the classic symptom of metadata being
    // set only in the root layout.
    const unique = new Set(titles.values());
    expect(
      unique.size,
      `pages share titles: ${JSON.stringify(Object.fromEntries(titles), null, 2)}`
    ).toBe(titles.size);
  });

  test("a product page carries Open Graph tags for link previews", async ({ page }) => {
    const product = await getInStockProduct();
    test.skip(!product, "no in-stock product in this database");

    await page.goto(`/products/${product!.slug}`);

    // These are what WhatsApp and Instagram DMs render — the two places this
    // shop's links actually get shared.
    expect(await metaContent(page, 'meta[property="og:title"]'), "no og:title").toBeTruthy();
    expect(
      await metaContent(page, 'meta[property="og:description"]'),
      "no og:description"
    ).toBeTruthy();

    const ogImage = await metaContent(page, 'meta[property="og:image"]');
    expect(ogImage, "no og:image — shared links render without a picture").toBeTruthy();
    expect(ogImage, "og:image must be absolute to be fetchable by a crawler").toMatch(/^https?:\/\//);
  });
});

test.describe("structured data", () => {
  test("the homepage ships valid Organization and WebSite JSON-LD", async ({ page }) => {
    await page.goto("/");

    const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
    expect(blocks.length, "no JSON-LD on the homepage").toBeGreaterThan(0);

    const parsed = blocks.map((raw, i) => {
      try {
        return JSON.parse(raw);
      } catch {
        throw new Error(`JSON-LD block ${i} is not valid JSON — crawlers will drop it`);
      }
    });

    const types = parsed.map((b) => b["@type"]);
    expect(types).toContain("Organization");
    expect(types).toContain("WebSite");
  });

  test("a product page ships valid Product JSON-LD with an offer", async ({ page }) => {
    const product = await getInStockProduct();
    test.skip(!product, "no in-stock product in this database");

    await page.goto(`/products/${product!.slug}`);

    const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
    const parsed = blocks.map((raw) => {
      try {
        return JSON.parse(raw);
      } catch {
        throw new Error("a JSON-LD block on the product page is not valid JSON");
      }
    });

    const productLd = parsed.find((b) => b["@type"] === "Product");
    expect(productLd, "no Product JSON-LD — no rich result in search").toBeTruthy();

    // An offer without a price and a currency is the half that gets rejected,
    // and it is rejected silently.
    expect(productLd.offers, "Product JSON-LD has no offers").toBeTruthy();
    const offer = Array.isArray(productLd.offers) ? productLd.offers[0] : productLd.offers;
    expect(offer.price, "offer has no price").toBeTruthy();
    expect(offer.priceCurrency, "offer has no currency").toBe("INR");
  });
});

test.describe("sitemap and robots", () => {
  test("the sitemap is well-formed XML and lists real URLs", async ({ request }) => {
    const response = await request.get("/sitemap.xml");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("xml");

    const body = await response.text();
    expect(body).toContain("<urlset");
    expect(body).toContain("</urlset>");

    const locs = [...body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(locs.length, "the sitemap lists no URLs at all").toBeGreaterThan(0);

    // Every entry must be absolute, or crawlers discard it.
    for (const loc of locs.slice(0, 50)) {
      expect(loc, `sitemap entry is not an absolute URL: ${loc}`).toMatch(/^https?:\/\//);
    }
  });

  test("robots.txt points at the sitemap", async ({ request }) => {
    const body = await (await request.get("/robots.txt")).text();
    expect(body.toLowerCase(), "robots.txt does not reference the sitemap").toContain("sitemap:");
  });
});
