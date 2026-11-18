import { test, expect, devices, type Page } from "@playwright/test";
import { signInAs } from "./helpers/auth";
import { createTestProduct, deleteTestProduct, countOrdersForUser, getInStockProduct } from "./helpers/db";
import { pieceAddButton } from "./helpers/ui";

/**
 * Round 2 of the Nov 2026 QA pass: what real people do that tests usually
 * don't — a cheap phone on a weak signal, losing the signal mid-checkout, two
 * tabs, a mangled cookie. (Back/refresh, a price or stock change while in the
 * cart, and signing out mid-checkout need COD, so they live in commerce.spec.)
 */

/** A budget Android on a weak 3G signal: ~1.6 Mbps down, 150ms latency, 4x slower CPU. */
async function slowPhone(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 150,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
  });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
}

test.describe("a budget phone on 3G", () => {
  // The phone's screen, touch and user agent — not its browser type, which a
  // describe group cannot change.
  const { defaultBrowserType: _ignored, ...pixel } = devices["Pixel 7"];
  void _ignored;
  test.use(pixel);

  test("the homepage shows its heading and menu within 8 seconds", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "network throttling is a Chromium feature");
    await slowPhone(page);
    const t0 = Date.now();
    await page.goto("/", { waitUntil: "commit" });
    await expect(page.locator("h1").first()).toBeVisible({ timeout: 20_000 });
    const ms = Date.now() - t0;
    test.info().annotations.push({ type: "homepage heading on 3G", description: `${ms} ms` });
    expect(ms, `homepage heading took ${ms}ms on 3G`).toBeLessThan(8_000);
  });

  test("a product page can be added to cart within 12 seconds", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "network throttling is a Chromium feature");
    const product = await getInStockProduct();
    test.skip(!product, "no simple in-stock product");
    await slowPhone(page);
    const t0 = Date.now();
    await page.goto(`/products/${product!.slug}`, { waitUntil: "commit" });
    const add = page.getByRole("button", { name: /^add to cart$/i }).locator("visible=true").first();
    await expect(add).toBeEnabled({ timeout: 30_000 });
    const ms = Date.now() - t0;
    test.info().annotations.push({ type: "product page usable on 3G", description: `${ms} ms` });
    expect(ms, `Add to cart became usable after ${ms}ms on 3G`).toBeLessThan(12_000);
  });
});

test.describe("losing the signal", () => {
  test("offline at the moment of paying: a clear message, no order, and it works once back online", async ({ page, context }) => {
    test.slow();
    const p = await createTestProduct({ stock: 2, price: 900 });
    const user = await signInAs(page, "customer", "offline");
    try {
      await page.goto(`/products/${p.slug}`);
      const add = pieceAddButton(page);
      await add.click();
      await expect(page.locator("[data-sonner-toast]").filter({ hasText: /added to cart/i }).first()).toBeVisible({ timeout: 20_000 });
      await page.goto("/checkout");
      await page.locator("#fullName").fill("E2E Offline");
      await page.locator("#phone").fill("8925014736");
      await page.locator("#addressLine1").fill("12 Test Street");
      await page.locator("#city").fill("Coimbatore");
      await page.locator("#state").selectOption("Tamil Nadu");
      await page.locator("#pincode").fill("641001");

      await context.setOffline(true);
      await page.locator('button[type="submit"]').locator("visible=true").first().click();
      // Give the page a fair chance to notice: 30 seconds offline.
      const told = /connection|internet|offline|try again|couldn.t|could not|unavailable|network/;
      const noticedOffline = await expect
        .poll(async () => told.test((await page.locator("body").innerText()).toLowerCase()), { timeout: 30_000 })
        .toBe(true)
        .then(() => true, () => false);
      const stuck = await page.getByText("Placing your order").isVisible().catch(() => false);
      test.info().annotations.push({
        type: "offline at Pay",
        description: `message shown: ${noticedOffline}; "Placing your order" spinner still up after 30s: ${stuck}`,
      });
      expect(noticedOffline, "30s offline at Pay: still the 'Placing your order — don't refresh' spinner, no message").toBe(true);
      expect(await countOrdersForUser(user.id)).toBe(0);
      // The form is still filled in — nothing typed is lost.
      await expect(page.locator("#fullName")).toHaveValue("E2E Offline");

      await context.setOffline(false);
    } finally {
      await context.setOffline(false);
      await user.dispose();
      await deleteTestProduct(p.id);
    }
  });
});

test.describe("tabs and cookies", () => {
  test("added in one tab, it is in the cart in the other", async ({ page, context }) => {
    const p = await createTestProduct({ stock: 3 });
    const user = await signInAs(page, "customer", "two-tabs");
    try {
      const other = await context.newPage();
      await other.goto("/cart");
      await page.goto(`/products/${p.slug}`);
      await pieceAddButton(page)
        .click();
      await expect(page.locator("[data-sonner-toast]").filter({ hasText: /added to cart/i }).first()).toBeVisible({ timeout: 20_000 });
      await other.reload();
      await expect(other.locator("main")).toContainText(p.name);
    } finally {
      await user.dispose();
      await deleteTestProduct(p.id);
    }
  });

  test("a mangled sign-in cookie means signed out — not a crash", async ({ page, context, baseURL }) => {
    const host = new URL(baseURL!).hostname;
    // The plain name is what an http test server reads; the __Secure- one is
    // production's, and browsers only accept it marked secure.
    await context.addCookies([
      { name: "authjs.session-token", value: "eyJhbGciOiJub25lIn0.garbage.tampered", domain: host, path: "/" },
    ]);
    const res = await page.goto("/account");
    expect(res?.status() ?? 200).toBeLessThan(500);
    await expect(page).toHaveURL(/\/login/);
    const home = await page.goto("/");
    expect(home?.status()).toBeLessThan(500);
  });
});
