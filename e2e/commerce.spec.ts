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

/** Deliberately multi-line: the packer copies these out as written. */
const GIFT_MESSAGE = `Happy birthday, Amma.
With all my love.`;

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

      /**
       * Wait for the TOAST, not for the cart badge.
       *
       * A signed-in cart is a Server Action writing to Postgres — the click
       * resolves before the row exists, and going straight to /checkout arrives
       * at an empty cart. Something has to mark the write as done.
       *
       * ⚠️  That used to be the header badge changing from "Cart is empty",
       * which worked only by accident: the badge was a server prop, so it moved
       * when the server re-rendered, which loosely tracked the write. It was
       * never a guarantee — hence this test's long-running intermittent failure
       * — and it stopped being even loosely true when the badge became
       * optimistic (see cart-button.tsx), because then it changed instantly
       * while Postgres had not been touched.
       *
       * AddToCartButton raises this toast only AFTER addToCartAction resolves
       * ok, so it is the one thing on screen that means "the server accepted
       * it". Assert on the real signal rather than a proxy for it.
       */
      await expect(
        page.getByText(/added to cart/i).first(),
        "the add-to-cart action never confirmed"
      ).toBeVisible({ timeout: 20_000 });

      await page.goto("/checkout");
      await expect(page.locator("#fullName")).toBeVisible({ timeout: 20_000 });

      /**
       * The "still needs filling in" banner has to go when the field is filled.
       *
       * It used to be stored text set on a failed submit and never cleared, so
       * a shopper who fixed the field was still being told one was missing —
       * with nothing highlighted, because the red ring DID clear. Done here,
       * before the form is filled, because an empty form is exactly the state
       * that produces it.
       */
      const banner = page.getByText(/still needs? (filling in|to be filled)/i);
      // By type, not by name: COD has not been chosen yet, so this button still
      // reads "Pay ₹1,309" rather than "Place order". Matching the label here
      // waits forever on a locator that resolves to nothing.
      await page.locator('button[type="submit"]').locator("visible=true").first().click();
      await expect(banner, "an empty checkout form submitted without complaint").toBeVisible({
        timeout: 10_000,
      });

      await page.locator("#fullName").fill("E2E Test Buyer");
      await page.locator("#phone").fill("9876543210");
      await page.locator("#addressLine1").fill("12 Test Street");
      await page.locator("#city").fill("Coimbatore");
      // A native <select> of Indian states, not a text field.
      await page.locator("#state").selectOption("Tamil Nadu");
      await page.locator("#pincode").fill("641001");

      /**
       * The reported bug, checked on the way past.
       *
       * Punjab with a Coimbatore pincode used to place an order successfully —
       * both fields were valid alone and nothing compared them. The form is
       * already filled, so proving it costs one selectOption and one assertion.
       * Set back to Tamil Nadu afterwards; the rest of this test is the happy
       * path and needs a consistent address.
       */
      await page.locator("#state").selectOption("Punjab");
      await expect(
        page.getByText(/isn't in the state you selected/i),
        "a Punjab/Coimbatore address was accepted without complaint"
      ).toBeVisible({ timeout: 10_000 });
      await page.locator("#state").selectOption("Tamil Nadu");
      await expect(page.getByText(/isn't in the state you selected/i)).toBeHidden();

      // Every field now carries a value, so the banner from the empty submit
      // above must have cleared itself — nobody pressed the button again.
      await expect(
        banner,
        "the validation banner outlived the fields it was complaining about"
      ).toBeHidden();

      /**
       * A gift message has to survive to the database, because it is the one
       * thing on an order that cannot be corrected once the parcel has gone.
       *
       * The textarea does not exist until the box is ticked — that is half of
       * what is being checked here. The other half is read back from the order
       * row below, not from the page: what matters is what the packer will see.
       */
      await expect(page.locator("#giftMessage")).toHaveCount(0);
      await page.getByLabel("This is a gift").check();
      await page.locator("#giftMessage").fill(GIFT_MESSAGE);

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

      // The card is written from these two columns, so these two columns are
      // what the test checks — not the confirmation screen.
      expect(order!.isGift, "the order was not marked as a gift").toBe(true);
      expect(order!.giftMessage, "the gift message did not survive to the order").toBe(
        GIFT_MESSAGE
      );

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

  /**
   * The processing overlay, which is the highest-stakes piece of UI in the shop
   * — the bug it exists to prevent is a shopper pressing pay twice, and that
   * costs a real person real money.
   *
   * ⚠️  Lives HERE rather than in a spec of its own for the reason at the top of
   * this file: it needs COD switched on, and anything that writes store
   * settings has to share this file's lock. It was written as its own spec
   * first and failed intermittently in the full suite for exactly the reason
   * documented above — commerce.spec flipped COD off in another worker while
   * it was mid-checkout.
   *
   * The Server Action is held open deliberately. The COD path completes in
   * about a second, and asserting on something that appears and vanishes in
   * that window is how a flaky test gets written; holding the POST makes the
   * overlay's presence a fact rather than a timing accident.
   */
  test("a processing overlay blocks the form while an order is being placed", async ({
    page,
    browser,
  }) => {
    const product = await getInStockProduct();
    test.skip(!product, "no in-stock, single-variant product in this database");

    await withAdmin(browser, async (adminPage) => {
      await openSettings(adminPage);
      await setToggle(adminPage, "codEnabled", true);
      await saveSettings(adminPage);
    });

    const email = `${E2E_EMAIL_PREFIX}overlay-${Date.now()}@example.test`;
    const customer = await createTestUser({ email, password: TEST_PASSWORD, role: "customer" });

    try {
      await signIn(page, email);

      await page.goto(`/products/${product!.slug}`);
      const addToCart = page
        .getByRole("button", { name: /add to (cart|bag)/i })
        .locator("visible=true");
      await expect(addToCart.first()).toBeVisible({ timeout: 20_000 });
      await addToCart.first().click();
      // The toast, not the badge — see the fuller note on the test above.
      await expect(
        page.getByText(/added to cart/i).first(),
        "the add-to-cart action never confirmed"
      ).toBeVisible({ timeout: 20_000 });

      await page.goto("/checkout");
      await expect(page.locator("#fullName")).toBeVisible({ timeout: 20_000 });

      await page.locator("#fullName").fill("E2E Overlay Buyer");
      await page.locator("#phone").fill("9876543210");
      await page.locator("#addressLine1").fill("12 Test Street");
      await page.locator("#city").fill("Coimbatore");
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

      // Server Actions POST back to the page's own URL, so matching on method
      // catches this one and nothing else.
      await page.route("**/checkout", async (route) => {
        if (route.request().method() === "POST") {
          await new Promise((resolve) => setTimeout(resolve, 4000));
        }
        await route.continue();
      });

      await placeOrder.click();

      await expect(
        page.getByText(/placing your order/i),
        "no processing overlay appeared after submitting"
      ).toBeVisible({ timeout: 10_000 });

      /**
       * `inert` is the half that stops a KEYBOARD; the overlay only stops a
       * pointer. Scoped with :has() because inert applies to a whole subtree
       * and several elements legitimately report it — what matters is that the
       * container holding the address fields is the inert one.
       */
      await expect(
        page.locator("div[inert]:has(#fullName)"),
        "the form was left reachable while the order was being placed"
      ).toBeAttached();

      // And it must come down again — an overlay outliving the request would
      // strand the shopper on a dead screen.
      await page.waitForURL(/\/orders\/|\/account\/orders\//, { timeout: 30_000 });
      await expect(page.getByText(/placing your order/i)).toBeHidden();
    } finally {
      await page.unroute("**/checkout").catch(() => {});
      await deleteOrdersForUser(customer.id).catch(() => {});
      await deleteUser(customer.id).catch(() => {});
      await withAdmin(browser, async (adminPage) => {
        await openSettings(adminPage);
        await setToggle(adminPage, "codEnabled", false);
        await saveSettings(adminPage);
      }).catch(() => {});
    }
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
