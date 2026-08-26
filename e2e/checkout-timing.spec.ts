import { test, expect, type Browser, type Page } from "@playwright/test";
import { signInAs } from "./helpers/auth";
import { deleteOrdersForUser, getInStockProduct, getLatestOrderForUser } from "./helpers/db";

/**
 * How long a shopper waits between confirming an order and seeing it.
 *
 * ── What this can and cannot answer ─────────────────────────────────────────
 * It measures the COD path, because that is the only one a test can drive:
 * paying online means completing a card payment inside Razorpay's own iframe on
 * their domain. So this covers `placeOrderAction` and the navigation to
 * /account/orders/[id] — NOT fulfillOrder, and therefore not the confirmation
 * email or the Razorpay payment fetch that the online path also waits on.
 *
 * That is still the question worth settling first. The complaint that prompted
 * this was measured in `next dev`, where arriving at a route for the first time
 * compiles it on demand — routinely seconds, and absent from a production
 * build. This suite runs against `next build` + `next start` (see
 * playwright.config.ts), so if the number here is small, the wait being felt in
 * dev was mostly the dev server compiling, and the remaining suspect is the
 * awaited email in fulfill-order.ts.
 *
 * ── Two measurements, because they answer different things ──────────────────
 * `firstVisit` is the whole felt wait: submit, order created, navigate, render.
 * `revisit` loads the same URL again once everything is warm. The gap between
 * them is one-off cost — route compilation in dev, cold caches in production —
 * and `revisit` alone is what the page costs on every subsequent request.
 *
 * ── The budgets are deliberately loose ──────────────────────────────────────
 * They are here to catch a step change, not to police normal variance. This
 * runs against a real Supabase instance over the public internet, so a slow
 * network makes the numbers move without anything having regressed. The figures
 * print on every run, passing or not, so the trend is visible.
 */

/** Generous. Creating an order writes several rows and then renders a page. */
const FIRST_VISIT_BUDGET_MS = 12_000;
/** A warm render of one order. Anything near this is worth looking at. */
const REVISIT_BUDGET_MS = 6_000;

const ADDRESS = {
  fullName: "E2E Timing",
  phone: "9876543210",
  addressLine1: "1 Test Street",
  city: "Chennai",
  state: "Tamil Nadu",
  pincode: "600001",
};

/** Runs a block as a throwaway admin in its own context — mirrors commerce.spec. */
async function withAdmin(browser: Browser, fn: (page: Page) => Promise<void>) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const admin = await signInAs(page, "admin", "timing-admin");
  try {
    await fn(page);
  } finally {
    await admin.dispose();
    await context.close();
  }
}

async function setCod(page: Page, on: boolean) {
  await page.goto("/admin/settings");
  const toggle = page.locator("#codEnabled");
  await expect(toggle).toBeVisible({ timeout: 15_000 });
  if (((await toggle.getAttribute("data-state")) === "checked") !== on) {
    await toggle.click();
  }
  await page.getByRole("button", { name: /^save/i }).click();
  await expect(page.getByText(/saved|updated/i).first()).toBeVisible({ timeout: 15_000 });
}

test.describe("checkout → order page timing", () => {
  /**
   * Serial, and chromium-only via the config's own note: this writes the
   * single-row StoreSetting table, which is global to the whole app. Two
   * workers toggling COD would fight, exactly as commerce.spec warns.
   */
  test.describe.configure({ mode: "serial" });

  test("placing a COD order reaches the order page promptly", async ({ page, browser }) => {
    const product = await getInStockProduct();
    test.skip(!product, "no in-stock, unsized product to buy");

    let codWasOn = false;
    await withAdmin(browser, async (admin) => {
      await admin.goto("/admin/settings");
      codWasOn = (await admin.locator("#codEnabled").getAttribute("data-state")) === "checked";
      await setCod(admin, true);
    });

    const shopper = await signInAs(page, "customer", "timing-shopper");

    try {
      // ── Build a cart ──────────────────────────────────────────────────────
      await page.goto(`/products/${product!.slug}`);
      await page.getByRole("button", { name: /add to (cart|bag)/i }).first().click();
      // The add is a Server Action; the cart badge is what confirms it landed.
      await page.waitForTimeout(1500);

      await page.goto("/checkout");
      await expect(page.locator("#fullName")).toBeVisible({ timeout: 20_000 });

      // ── Fill it in ────────────────────────────────────────────────────────
      await page.locator("#fullName").fill(ADDRESS.fullName);
      await page.locator("#phone").fill(ADDRESS.phone);
      await page.locator("#addressLine1").fill(ADDRESS.addressLine1);
      await page.locator("#city").fill(ADDRESS.city);
      await page.locator("#state").selectOption(ADDRESS.state);
      await page.locator("#pincode").fill(ADDRESS.pincode);

      await page.locator('input[name="paymentMethod"][value="cod"]').check();
      // The pincode lookup is debounced at 450ms and the button label depends on
      // the payment method; let both settle so the click is not racing them.
      await page.waitForTimeout(1500);

      // ── The measurement ───────────────────────────────────────────────────
      const submit = page
        .getByRole("button", { name: /place order|pay ₹/i })
        .first();
      await expect(submit).toBeEnabled({ timeout: 10_000 });

      const began = Date.now();
      await submit.click();
      // The order NUMBER on screen is the honest finish line: the URL changes
      // as soon as the transition commits, while this only appears once the
      // streamed order content has actually rendered.
      await expect(page.getByText(/^MYS-\d+/)).toBeVisible({ timeout: 40_000 });
      const firstVisit = Date.now() - began;

      const orderUrl = page.url();

      // ── Same page again, everything warm ──────────────────────────────────
      await page.goto("/account/orders");
      const revisitBegan = Date.now();
      await page.goto(orderUrl);
      await expect(page.getByText(/^MYS-\d+/)).toBeVisible({ timeout: 40_000 });
      const revisit = Date.now() - revisitBegan;

      const order = await getLatestOrderForUser(shopper.id);
      expect(order, "the COD order was not written").not.toBeNull();

      const summary =
        `order=${order?.orderNumber} firstVisit=${firstVisit}ms revisit=${revisit}ms ` +
        `oneOff=${Math.max(0, firstVisit - revisit)}ms`;
      console.info(`[checkout-timing] ${summary}`);
      test.info().annotations.push({ type: "timing", description: summary });

      expect(
        firstVisit,
        `placing an order to seeing it took ${firstVisit}ms (budget ${FIRST_VISIT_BUDGET_MS}ms). ` +
          "Against a production build this is the real wait; check the [fulfill] " +
          "and [checkout] logs for where it went."
      ).toBeLessThan(FIRST_VISIT_BUDGET_MS);

      expect(
        revisit,
        `re-opening the same order took ${revisit}ms (budget ${REVISIT_BUDGET_MS}ms). ` +
          "This one is per-request cost, not a one-off — if it is high, the page " +
          "itself is slow rather than the order creation."
      ).toBeLessThan(REVISIT_BUDGET_MS);
    } finally {
      await deleteOrdersForUser(shopper.id).catch(() => {});
      await shopper.dispose();
      // Put the shop back the way it was found — through the admin form, so the
      // settings cache tag is invalidated. See resetStoreSettings' note.
      await withAdmin(browser, async (admin) => setCod(admin, codWasOn));
    }
  });

  /**
   * The processing overlay is on the highest-stakes screen in the shop, and the
   * bug it prevents — pressing pay twice — costs a real customer real money. So
   * it is worth a test that it genuinely blocks, not just that it renders.
   *
   * The Server Action is held open deliberately. Without that this races: the
   * COD path completes in about a second, and asserting on something that
   * appears and vanishes in that window is how a flaky test is written. Holding
   * the POST makes the overlay's presence a fact rather than a timing accident.
   */
  test("the processing overlay blocks the form while an order is being placed", async ({
    page,
    browser,
  }) => {
    const product = await getInStockProduct();
    test.skip(!product, "no in-stock, unsized product to buy");

    let codWasOn = false;
    await withAdmin(browser, async (admin) => {
      await admin.goto("/admin/settings");
      codWasOn = (await admin.locator("#codEnabled").getAttribute("data-state")) === "checked";
      await setCod(admin, true);
    });

    const shopper = await signInAs(page, "customer", "timing-overlay");

    try {
      await page.goto(`/products/${product!.slug}`);
      await page.getByRole("button", { name: /add to (cart|bag)/i }).first().click();
      await page.waitForTimeout(1500);

      await page.goto("/checkout");
      await expect(page.locator("#fullName")).toBeVisible({ timeout: 20_000 });

      await page.locator("#fullName").fill(ADDRESS.fullName);
      await page.locator("#phone").fill(ADDRESS.phone);
      await page.locator("#addressLine1").fill(ADDRESS.addressLine1);
      await page.locator("#city").fill(ADDRESS.city);
      await page.locator("#state").selectOption(ADDRESS.state);
      await page.locator("#pincode").fill(ADDRESS.pincode);
      await page.locator('input[name="paymentMethod"][value="cod"]').check();
      await page.waitForTimeout(1500);

      // Hold the Server Action open. Server Actions POST back to the page's own
      // URL, so matching on method is enough to catch it and nothing else.
      await page.route("**/checkout", async (route) => {
        if (route.request().method() === "POST") {
          await new Promise((resolve) => setTimeout(resolve, 4000));
        }
        await route.continue();
      });

      await page.getByRole("button", { name: /place order|pay ₹/i }).first().click();

      await expect(
        page.getByText(/placing your order/i),
        "the processing overlay did not appear after submitting"
      ).toBeVisible({ timeout: 10_000 });

      /**
       * inert is what stops a KEYBOARD reaching the form; the overlay only
       * stops a pointer, so this is the harder half of the guarantee.
       *
       * Scoped with :has() rather than a bare div[inert] — inert applies to a
       * whole subtree, so several elements on the page legitimately report it
       * and a bare selector is a strict-mode violation. What actually matters
       * is that the container holding the address fields is the inert one.
       */
      await expect(
        page.locator("div[inert]:has(#fullName)"),
        "the form was left reachable while the order was being placed"
      ).toBeAttached();

      // And it must come down again — an overlay that outlives the request
      // would strand the shopper on a dead screen.
      await expect(page.getByText(/^MYS-\d+/)).toBeVisible({ timeout: 40_000 });
      await expect(page.getByText(/placing your order/i)).toBeHidden();
    } finally {
      await page.unroute("**/checkout").catch(() => {});
      await deleteOrdersForUser(shopper.id).catch(() => {});
      await shopper.dispose();
      await withAdmin(browser, async (admin) => setCod(admin, codWasOn));
    }
  });
});
