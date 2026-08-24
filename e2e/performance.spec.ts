import { test, expect, type Page } from "@playwright/test";
import { getInStockProduct } from "./helpers/db";

/**
 * Page weight budgets.
 *
 * Not a Lighthouse score — a score moves for reasons nobody can act on, and it
 * needs the network conditions of the machine running it. What is worth
 * guarding is the thing that only ever grows quietly: how many bytes of
 * JavaScript a shopper on a phone in India has to download before the page
 * works. A budget fails the day someone adds a heavy dependency to a shared
 * layout, which is the day it is cheap to fix.
 *
 * Budgets are set generously above the current measurements, so this catches
 * a step change rather than normal drift. The numbers are printed on every run
 * so the trend is visible even while passing.
 */

type Weight = { jsBytes: number; imageBytes: number; totalBytes: number; requests: number };

async function measure(page: Page, path: string): Promise<Weight> {
  const seen = new Map<string, { type: string; bytes: number }>();

  page.on("response", async (response) => {
    const url = response.url();
    if (seen.has(url)) return;

    const headers = response.headers();
    const type = headers["content-type"] ?? "";
    // content-length is absent on streamed responses; body() is the honest
    // measure but costs a read, so it is only used when the header is missing.
    let bytes = Number(headers["content-length"] ?? 0);
    if (!bytes) {
      bytes = await response
        .body()
        .then((b) => b.byteLength)
        .catch(() => 0);
    }
    seen.set(url, { type, bytes });
  });

  await page.goto(path, { waitUntil: "load" });
  // Let deferred/lazy chunks settle before totting up.
  await page.waitForTimeout(1500);

  let jsBytes = 0;
  let imageBytes = 0;
  let totalBytes = 0;
  for (const { type, bytes } of seen.values()) {
    totalBytes += bytes;
    if (type.includes("javascript")) jsBytes += bytes;
    if (type.startsWith("image/")) imageBytes += bytes;
  }

  return { jsBytes, imageBytes, totalBytes, requests: seen.size };
}

const kb = (n: number) => Math.round(n / 1024);

test.describe("page weight", () => {
  /**
   * ⚠️  These are DECOMPRESSED bytes, not what crosses the wire.
   *
   * Next serves the chunks gzipped and omits content-length on them, so the
   * measurement above falls back to reading the body — which Playwright hands
   * back already decompressed. A shopper pays roughly a third of the JS figure.
   * Left as-is rather than corrected, because a budget only has to be
   * comparable with itself; what matters is that it moves when someone adds a
   * dependency, and mixing units run-to-run would break exactly that.
   *
   * Measured at the time of writing: homepage ~907kB JS, product ~930kB. The
   * budget sits above both with room for normal drift, so a failure means a
   * step change rather than a few more components.
   */
  const JS_BUDGET_KB = 1200;

  /**
   * Total was 15,055kB before F-11 — a 12.8 MB unoptimised hero video, against
   * ~1.4 MB for the whole rest of the page. It is 2,234kB now. This budget is
   * what stops an untransformed Cloudinary URL going back in unnoticed.
   */
  const TOTAL_BUDGET_KB = 3500;

  test("the homepage stays within its JavaScript budget", async ({ page }, testInfo) => {
    const w = await measure(page, "/");

    testInfo.annotations.push({
      type: "weight",
      description: `homepage — js ${kb(w.jsBytes)}kB, images ${kb(w.imageBytes)}kB, total ${kb(
        w.totalBytes
      )}kB across ${w.requests} requests`,
    });
    console.log(
      `[weight] homepage js=${kb(w.jsBytes)}kB images=${kb(w.imageBytes)}kB total=${kb(
        w.totalBytes
      )}kB requests=${w.requests}`
    );

    expect(kb(w.jsBytes), "homepage JavaScript has grown past its budget").toBeLessThan(
      JS_BUDGET_KB
    );
    expect(kb(w.totalBytes), "homepage total weight has grown past its budget").toBeLessThan(
      TOTAL_BUDGET_KB
    );
  });

  test("a product page stays within its JavaScript budget", async ({ page }, testInfo) => {
    const product = await getInStockProduct();
    test.skip(!product, "no in-stock product in this database");

    const w = await measure(page, `/products/${product!.slug}`);

    testInfo.annotations.push({
      type: "weight",
      description: `product — js ${kb(w.jsBytes)}kB, images ${kb(w.imageBytes)}kB, total ${kb(
        w.totalBytes
      )}kB across ${w.requests} requests`,
    });
    console.log(
      `[weight] product js=${kb(w.jsBytes)}kB images=${kb(w.imageBytes)}kB total=${kb(
        w.totalBytes
      )}kB requests=${w.requests}`
    );

    expect(kb(w.jsBytes), "product page JavaScript has grown past its budget").toBeLessThan(
      JS_BUDGET_KB
    );
  });
});

test.describe("image delivery", () => {
  test("product imagery is served in a modern format", async ({ page }) => {
    const product = await getInStockProduct();
    test.skip(!product, "no in-stock product in this database");

    const formats: string[] = [];
    page.on("response", (r) => {
      const type = r.headers()["content-type"] ?? "";
      if (type.startsWith("image/") && r.url().includes("/_next/image")) formats.push(type);
    });

    await page.goto(`/products/${product!.slug}`, { waitUntil: "load" });
    await page.waitForTimeout(1500);

    if (formats.length === 0) {
      // The demo catalogue points at placehold.co, which next/image is only
      // allowed to optimise when ALLOW_PLACEHOLDER_IMAGES is set — so on a
      // placeholder-only database there is nothing to assert.
      test.skip(true, "no next/image responses on this page — placeholder catalogue");
    }

    // next.config.ts asks for AVIF first, WebP as fallback. Seeing jpeg here
    // means the optimizer was bypassed and every shopper is paying for it.
    expect(
      formats.every((f) => f.includes("avif") || f.includes("webp")),
      `next/image served a legacy format: ${[...new Set(formats)].join(", ")}`
    ).toBe(true);
  });
});

test.describe("hero video delivery", () => {
  /**
   * Regression cover for F-11 (audit, Aug 2026).
   *
   * The homepage shipped a 12.8 MB autoplaying MP4 because the carousel used
   * the CMS's stored Cloudinary URL verbatim, and an untransformed Cloudinary
   * URL means "return the original upload". The page-weight budget above would
   * catch a repeat, but only as a number; this says what actually went wrong.
   */
  test("the hero video is requested through a Cloudinary transformation", async ({ page }) => {
    await page.goto("/");

    const video = page.locator("video").first();
    if ((await video.count()) === 0) {
      test.skip(true, "no video hero published on this database");
    }

    const src = await video.getAttribute("src");
    expect(src, "the hero video has no src").toBeTruthy();

    if (!src!.includes("res.cloudinary.com")) {
      test.skip(true, "hero video is not Cloudinary-hosted");
    }

    // The transformation segment sits between /video/upload/ and the public ID.
    expect(
      src,
      "the hero video is served untransformed — this is the 12.8 MB regression"
    ).toMatch(/\/video\/upload\/[^/]*q_auto[^/]*\//);
    expect(src, "no width cap on the hero video").toContain("w_1920");

    // A poster means the frame is painted before any video byte lands.
    const poster = await video.getAttribute("poster");
    expect(poster, "the hero video has no poster").toBeTruthy();
    expect(poster, "the poster must not keep the video extension").not.toMatch(/\.mp4\.jpg$/i);
  });

  test("the transformed video and its poster both actually resolve", async ({ page, request }) => {
    await page.goto("/");

    const video = page.locator("video").first();
    if ((await video.count()) === 0) test.skip(true, "no video hero published");

    const src = await video.getAttribute("src");
    const poster = await video.getAttribute("poster");
    if (!src?.includes("res.cloudinary.com")) test.skip(true, "hero video is not Cloudinary-hosted");

    // Cloudinary answers a bad transformation with 404 — and, for images, a
    // zero-byte GIF, so a broken poster fails silently. Both are checked.
    const videoResponse = await request.get(src!);
    expect(videoResponse.status(), "the transformed hero video 404s").toBe(200);
    expect(videoResponse.headers()["content-type"]).toContain("video/");

    if (poster) {
      const posterResponse = await request.get(poster);
      expect(posterResponse.status(), "the hero poster 404s").toBe(200);
      expect(posterResponse.headers()["content-type"], "the poster is not an image").toContain(
        "image/"
      );
    }
  });
});

test.describe("search suggestions under pressure", () => {
  /**
   * Regression cover for F-12 (audit Phase 5, Aug 2026).
   *
   * Measured against the demo deployment: this route returned 500s from 60
   * concurrent requests and was failing 53% of them at 100, while /products
   * absorbed 220 concurrent without a single error. Each request holds two
   * pooled connections at once against a pool of five per instance — on the one
   * endpoint that fires while someone is typing.
   */
  test("is cacheable by the shared edge cache", async ({ request }) => {
    const response = await request.get("/api/search/suggestions?q=silver");
    expect(response.status()).toBe(200);

    // s-maxage is what lets Vercel's edge answer the repeats. Losing it puts
    // every keystroke back on the connection pool.
    const cacheControl = response.headers()["cache-control"] ?? "";
    expect(cacheControl, "suggestions are no longer edge-cacheable").toContain("s-maxage");
    expect(cacheControl).toContain("public");
  });

  test("answers a burst of concurrent requests without a single 500", async ({ request }) => {
    // Well past the point the deployed version started failing. Locally there
    // is no CDN in front, so this exercises the origin and the pool directly —
    // which is the harsher test of the two.
    const terms = ["sil", "silv", "silver", "ring", "earr", "neck", "brac", "ankl"];
    const responses = await Promise.all(
      Array.from({ length: 80 }, (_, i) =>
        request.get(`/api/search/suggestions?q=${terms[i % terms.length]}`)
      )
    );

    const serverErrors = responses.filter((r) => r.status() >= 500);
    expect(
      serverErrors.length,
      `${serverErrors.length}/80 suggestion requests returned 5xx`
    ).toBe(0);

    // And every one is still valid JSON of the right shape — degrading to an
    // empty list is acceptable, degrading to a broken body is not.
    for (const r of responses.slice(0, 10)) {
      const body = await r.json();
      expect(Array.isArray(body.products)).toBe(true);
      expect(Array.isArray(body.categories)).toBe(true);
    }
  });
});
