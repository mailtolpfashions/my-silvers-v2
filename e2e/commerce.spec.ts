import { test, expect, type Page, type Browser } from "@playwright/test";
import { signInAs, signIn, TEST_PASSWORD, E2E_EMAIL_PREFIX } from "./helpers/auth";
import {
  createTestUser,
  deleteUser,
  deleteOrdersForUser,
  getLatestOrderForUser,
  getInStockProduct,
  getOrderItemsWithCatalogPrice,
  resetStoreSettings,
} from "./helpers/db";

/**
 * The shop's operational switches, and an order placed through them.
 *
 * ⚠️  ONE FILE ON PURPOSE. Every test here mutates the same single-row
 * StoreSetting table — COD on/off, shipping rates — which is global to the
 * whole application. Split across two spec files they ran concurrently and
 * fought: one suite switched COD off while the other was mid-checkout
 * expecting it on. Playwright serialises within a file, not across them, so
 * the file boundary IS the lock. Anything that writes store settings belongs
 * in here.
 *
 * Chromium only (see playwright.config.ts). These assert server-side business
 * rules, not layout — running them a second time at a phone viewport would
 * double the contention for the same resource and prove nothing new.
 *
 * Settings are read through the ADMIN FORM rather than written to the table
 * directly: reads are cached with a 60s revalidate window (cacheLife.settings)
 * and only the admin save action calls updateTag, so a direct write would be
 * invisible to the storefront for up to a minute. Going through the form also
 * exercises the invalidation path that has to work when the owner flips COD
 * off on a Sunday.
 */

test.describe.configure({ mode: "serial" });

// Deliberately odd, so a hardcoded ₹49/₹999 default cannot satisfy the
// assertions, and the threshold is unreachable so shipping always applies.
const SHIPPING = "77";
const THRESHOLD = "99999";

async function saveSettings(page: Page) {
  await page.getByRole("button", { name: /^save/i }).click();
  await expect(page.getByText(/saved|updated/i).first()).toBeVisible({ timeout: 15_000 });
}

async function openSettings(page: Page) {
  await page.goto("/admin/settings");
  await expect(page.locator("#codEnabled")).toBeVisible({ timeout: 15_000 });
}

async function readSettings(page: Page) {
  await openSettings(page);
  return {
    cod: (await page.locator("#codEnabled").getAttribute("data-state")) === "checked",
    guest: (await page.locator("#guestCheckoutEnabled").getAttribute("data-state")) === "checked",
    shipping: await page.locator("#shippingCharge").inputValue(),
    threshold: await page.locator("#freeShippingThreshold").inputValue(),
  };
}

async function setToggle(page: Page, id: string, on: boolean) {
  const toggle = page.locator(`#${id}`);
  if (((await toggle.getAttribute("data-state")) === "checked") !== on) await toggle.click();
}

/** Runs a block as a throwaway admin in its own browser context. */
async function withAdmin(browser: Browser, fn: (page: Page) => Promise<void>) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const admin = await signInAs(page, "admin", "commerce-admin");
  try {
    await fn(page);
  } finally {
    await admin.dispose();
    await context.close();
  }
}

test.describe("store settings gate what the shop actually does", () => {
  test("turning COD on makes it available at checkout, and off removes it", async ({ page }) => {
    const admin = await signInAs(page, "admin", "settings");
    const original = await readSettings(page);

    try {
      await setToggle(page, "codEnabled", true);
      await saveSettings(page);

      await page.goto("/checkout");
      expect(
        (await page.textContent("body"))?.toLowerCase() ?? "",
        "COD was enabled but is not offered at checkout"
      ).toMatch(/cash on delivery|\bcod\b/);

      await openSettings(page);
      await setToggle(page, "codEnabled", false);
      await saveSettings(page);

      await page.goto("/checkout");
      expect(
        (await page.textContent("body"))?.toLowerCase() ?? "",
        "COD was disabled but is still offered at checkout"
      ).not.toMatch(/cash on delivery/);
    } finally {
      await openSettings(page);
      await setToggle(page, "codEnabled", original.cod);
      await saveSettings(page).catch(() => {});
      await admin.dispose();
    }
  });

  test("shipping rates entered by the admin survive the round trip", async ({ page }) => {
    const admin = await signInAs(page, "admin", "shiprate");
    const original = await readSettings(page);

    try {
      await page.locator("#shippingCharge").fill(SHIPPING);
      await page.locator("#freeShippingThreshold").fill(THRESHOLD);
      await saveSettings(page);

      // Rupees → paise → rupees is where money bugs live.
      const saved = await readSettings(page);
      expect(saved.shipping).toBe(SHIPPING);
      expect(saved.threshold).toBe(THRESHOLD);
    } finally {
      await openSettings(page);
      await page.locator("#shippingCharge").fill(original.shipping);
      await page.locator("#freeShippingThreshold").fill(original.threshold);
      await saveSettings(page).catch(() => {});
      await admin.dispose();
    }
  });

  test("disabling guest checkout sends an anonymous shopper to login", async ({ page, browser }) => {
    const admin = await signInAs(page, "admin", "guestck");
    const original = await readSettings(page);

    try {
      await setToggle(page, "guestCheckoutEnabled", false);
      await saveSettings(page);

      // A genuinely anonymous browser — the admin's session must not leak in.
      const anonContext = await browser.newContext();
      const anon = await anonContext.newPage();
      try {
        await anon.goto("/checkout");
        await expect(anon, "guest checkout was disabled but a guest reached it").toHaveURL(
          /\/login/,
          { timeout: 20_000 }
        );
      } finally {
        await anonContext.close();
      }
    } finally {
      await openSettings(page);
      await setToggle(page, "guestCheckoutEnabled", original.guest);
      await saveSettings(page).catch(() => {});
      await admin.dispose();
    }
  });

  test("only an admin can change them", async ({ page }) => {
    const editor = await signInAs(page, "editor", "settings-editor");
    try {
      // An editor is a legitimate CMS user. COD and shipping rates are money.
      await page.goto("/admin/settings");
      await expect(page, "an editor reached store settings").toHaveURL(/\/login/);
    } finally {
      await editor.dispose();
    }
  });
});

test.describe("cash on delivery, end to end", () => {
  /**
   * The assertion that matters is the arithmetic. create-order.ts recomputes
   * subtotal, shipping and total from database prices and ignores whatever the
   * browser sent; this places a real order and reads the row back to prove it.
   *
   * COD rather than Razorpay because it is the one path that COMPLETES without
   * a live gateway — and completing is the point. An order that only reaches
   * the payment popup proves the form works, not that the shop takes money
   * correctly.
   */
  test("places an order whose totals the server computed, not the browser", async ({
    page,
    browser,
  }) => {
    const product = await getInStockProduct();
    test.skip(!product, "no in-stock, single-variant product in this database");

    await withAdmin(browser, async (adminPage) => {
      await openSettings(adminPage);
      await setToggle(adminPage, "codEnabled", true);
      await adminPage.locator("#shippingCharge").fill(SHIPPING);
      await adminPage.locator("#freeShippingThreshold").fill(THRESHOLD);
      await saveSettings(adminPage);
    });

    const email = `${E2E_EMAIL_PREFIX}cod-${Date.now()}@example.test`;
    const customer = await createTestUser({ email, password: TEST_PASSWORD, role: "customer" });

    try {
      await signIn(page, email);

      await page.goto(`/products/${product!.slug}`);
      const addToCart = page
        .getByRole("button", { name: /add to (cart|bag)/i })
        .locator("visible=true");
      await expect(addToCart.first()).toBeVisible({ timeout: 20_000 });
      await addToCart.first().click();

      // A signed-in cart is a Server Action writing to Postgres, not
      // localStorage — the click resolves before the row exists, and going
      // straight to /checkout arrives at an empty cart.
      await expect(
        page.getByRole("link", { name: /cart/i }).first(),
        "the item never reached the server-side cart"
      ).not.toContainText(/empty/i, { timeout: 20_000 });

      await page.goto("/checkout");
      await expect(page.locator("#fullName")).toBeVisible({ timeout: 20_000 });

      await page.locator("#fullName").fill("E2E Test Buyer");
      await page.locator("#phone").fill("9876543210");
      await page.locator("#addressLine1").fill("12 Test Street");
      await page.locator("#city").fill("Coimbatore");
      // A native <select> of Indian states, not a text field.
      await page.locator("#state").selectOption("Tamil Nadu");
      await page.locator("#pincode").fill("641001");

      const codOption = page.locator('input[name="paymentMethod"][value="cod"]');
      await expect(codOption, "COD was enabled but no COD option rendered").toHaveCount(1);
      await codOption.check({ force: true });

      const placeOrder = page
        .getByRole("button", { name: /place order/i })
        .locator("visible=true")
        .first();
      await expect(placeOrder).toBeEnabled({ timeout: 20_000 });
      await placeOrder.click();

      await page.waitForURL(/\/orders\/|\/account\/orders\//, { timeout: 30_000 });

      const order = await getLatestOrderForUser(customer.id);
      expect(order, "no order row was created").not.toBeNull();

      const items = await getOrderItemsWithCatalogPrice(order!.orderNumber);
      expect(items.length, "the order has no line items").toBeGreaterThan(0);

      /**
       * Invariants, not a guess at what the cart held.
       *
       * An earlier version asserted `subtotal === thePriceIWasExpecting`, which
       * flaked the moment the cart contained anything else — and told me
       * nothing about WHY. These three checks are what actually matters and
       * hold whatever ends up in the basket:
       *
       *   1. every line item was priced from the Product table, not from the
       *      browser — the anti-tampering property;
       *   2. subtotal is the sum of those lines;
       *   3. total is subtotal plus the shipping the admin configured.
       */
      for (const item of items) {
        expect(
          Number(item.itemPrice),
          `"${item.name}" was not priced from the catalogue`
        ).toBeCloseTo(Number(item.catalogPrice), 2);
      }

      const expectedSubtotal = items.reduce(
        (sum, i) => sum + Number(i.itemPrice) * i.quantity,
        0
      );
      const shipping = Number(SHIPPING);

      expect(
        Number(order!.subtotal),
        "subtotal is not the sum of the line items"
      ).toBeCloseTo(expectedSubtotal, 2);
      expect(
        Number(order!.shippingCharge),
        "the admin's shipping rate was not the one charged"
      ).toBeCloseTo(shipping, 2);
      expect(
        Number(order!.totalAmount),
        "total is not subtotal + shipping as the server computes it"
      ).toBeCloseTo(expectedSubtotal + shipping, 2);

      expect(order!.paymentMethod).toBe("cod");
      // COD stays 'pending' by design — money has not moved, and the refund
      // sweep must never touch it.
      expect(order!.paymentStatus).toBe("pending");
    } finally {
      await deleteOrdersForUser(customer.id).catch(() => {});
      await deleteUser(customer.id).catch(() => {});
      await withAdmin(browser, async (adminPage) => {
        await openSettings(adminPage);
        await setToggle(adminPage, "codEnabled", false);
        await saveSettings(adminPage);
      }).catch(() => {});
    }
  });

  test("COD is not offered when the shop has it switched off", async ({ page }) => {
    await page.goto("/checkout");
    const codOption = page.locator('input[name="paymentMethod"][value="cod"]');
    await expect(codOption, "COD is switched off but still offered").toHaveCount(0);
  });
});

/**
 * The crash net for the one table these tests share.
 *
 * Each test restores what it found in a finally block, but a test that dies
 * mid-way — or whose admin is deleted underneath it — leaves the shop
 * configured however the assertion left it. That is not a self-correcting
 * mistake: a stale `guestCheckoutEnabled: false` silently changes what every
 * later run is testing, and a stale ₹77 shipping rate quietly becomes the
 * baseline nobody questions. Deleting the row restores the coded defaults
 * (COD off, guest checkout on, ₹49 free over ₹999).
 *
 * Safe as a file-level hook because commerce.spec is the only file that writes
 * store settings — that is exactly why they all live here.
 */
test.afterAll(async () => {
  await resetStoreSettings().catch(() => {});
});
