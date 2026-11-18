import { test, expect, type Page, type Browser } from "@playwright/test";
import { signInAs } from "./helpers/auth";
import {
  createTestProduct,
  deleteTestProduct,
  deleteOrdersForUser,
  getStock,
  queryOne,
} from "./helpers/db";
import { pieceAddButton } from "./helpers/ui";

/**
 * REAL online payments through Razorpay — in TEST mode only.
 *
 * Drives the actual Razorpay window: netbanking → Razorpay's demo bank →
 * Success / Failure. No money exists in test mode; refunds go to the same
 * pretend account.
 *
 * ⚠️  Guarded twice:
 *   - skipped unless BOTH key ids in .env start `rzp_test_` — a live key here
 *     would take real money;
 *   - never part of a remote run (not @live-safe).
 *
 * Test numbers must look real: Razorpay refuses obvious dummies such as
 * 9876543210 ("Please enter a valid mobile number").
 */

const keyId = process.env.RAZORPAY_KEY_ID ?? "";
const publicKey = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? "";
const testMode = keyId.startsWith("rzp_test_") && publicKey.startsWith("rzp_test_");
const PHONE = "8925014736";

test.skip(!testMode, "Razorpay TEST keys are not in .env — these tests take real payments otherwise");
test.describe.configure({ mode: "serial" });

async function checkoutOnline(page: Page, slug: string) {
  await page.goto(`/products/${slug}`);
  const name = (await page.locator("h1:visible").first().innerText()).trim();
  const add = pieceAddButton(page);
  await expect(add).toBeEnabled({ timeout: 20_000 });
  await add.click();
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: /added to cart/i }).first()).toBeVisible({ timeout: 20_000 });
  await page.goto("/checkout");
  await expect(page.locator("#fullName")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("main"), "the wrong piece is in the cart").toContainText(name);
  await page.locator("#fullName").fill("E2E Online Buyer");
  await page.locator("#phone").fill(PHONE);
  await page.locator("#addressLine1").fill("12 Test Street");
  await page.locator("#city").fill("Coimbatore");
  await page.locator("#state").selectOption("Tamil Nadu");
  await page.locator("#pincode").fill("641001");
  // Choose online explicitly. When COD is switched on (commerce.spec flips it
  // in a parallel worker) the form offers both, and the choice must not be
  // left to whatever the default is at that moment.
  const online = page.locator('input[name="paymentMethod"][value="razorpay"]');
  if (await online.count()) await online.check({ force: true });
  await page.locator('button[type="submit"]').locator("visible=true").first().click();
  await page.waitForSelector("iframe.razorpay-checkout-frame", { timeout: 30_000 });
}

/** Netbanking → HDFC (demo) → Success/Failure on Razorpay's demo bank page. */
async function payInRazorpay(page: Page, outcome: "Success" | "Failure") {
  const frame = page.frameLocator("iframe.razorpay-checkout-frame");
  const mobile = frame.getByPlaceholder(/mobile number/i);
  await frame.getByText("Netbanking", { exact: true }).first().waitFor({ timeout: 30_000 });
  if (await mobile.isVisible().catch(() => false)) {
    await mobile.fill(PHONE);
    await frame.getByRole("button", { name: /^continue$/i }).click();
  }
  await frame.getByText("Netbanking", { exact: true }).first().click();
  const popupPromise = page.waitForEvent("popup", { timeout: 30_000 });
  await frame.getByText("HDFC Bank", { exact: true }).first().click();
  const bank = await popupPromise;
  const button = bank.getByRole("button", { name: outcome }).first();
  await button.waitFor({ timeout: 60_000 });
  await button.click();
}

async function latestOrder(userId: string) {
  return queryOne<{ id: string; orderNumber: string; paymentStatus: string; orderStatus: string; refundStatus: string; razorpayPaymentId: string | null }>(
    `SELECT "id", "orderNumber", "paymentStatus"::text, "orderStatus"::text, "refundStatus"::text, "razorpayPaymentId"
       FROM "Order" WHERE "userId" = $1 ORDER BY "createdAt" DESC LIMIT 1`,
    [userId]
  );
}

async function newShopper(browser: Browser, tag: string) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const user = await signInAs(page, "customer", tag);
  return { ctx, page, user };
}

test.describe("online payment (Razorpay test mode)", () => {
  test("a successful payment confirms the order and takes the stock", async ({ page }) => {
    test.setTimeout(180_000);
    const p = await createTestProduct({ stock: 2, price: 1200 });
    const user = await signInAs(page, "customer", "rzp-ok");
    try {
      await checkoutOnline(page, p.slug);
      await payInRazorpay(page, "Success");
      await page.waitForURL(/\/orders\/.*placed=1/, { timeout: 90_000 });

      const o = await latestOrder(user.id);
      expect(o?.paymentStatus).toBe("paid");
      expect(o?.orderStatus).toBe("confirmed");
      expect(o?.razorpayPaymentId, "no Razorpay payment id stored").toMatch(/^pay_/);
      expect(await getStock(p.id)).toBe(1);
      await expect(page.locator("main")).toContainText(o!.orderNumber);
    } finally {
      await deleteOrdersForUser(user.id).catch(() => {});
      await user.dispose();
      await deleteTestProduct(p.id);
    }
  });

  test("a failed payment takes no stock, confirms nothing, and lets the shopper try again", async ({ page }) => {
    test.setTimeout(180_000);
    const p = await createTestProduct({ stock: 2, price: 1100 });
    const user = await signInAs(page, "customer", "rzp-fail");
    try {
      await checkoutOnline(page, p.slug);
      await payInRazorpay(page, "Failure");
      // Razorpay keeps its window open and offers a retry; our page must not
      // have moved on to a confirmation.
      await page.waitForTimeout(8000);
      expect(page.url()).toContain("/checkout");
      const o = await latestOrder(user.id);
      expect(o?.paymentStatus, "a failed payment was treated as paid").not.toBe("paid");
      expect(o?.orderStatus).not.toBe("confirmed");
      expect(await getStock(p.id), "a failed payment took stock").toBe(2);
    } finally {
      await deleteOrdersForUser(user.id).catch(() => {});
      await user.dispose();
      await deleteTestProduct(p.id);
    }
  });

  test("the owner cancels a paid order: Razorpay refunds it and the piece goes back on sale", async ({ page, browser }) => {
    test.setTimeout(240_000);
    const p = await createTestProduct({ stock: 1, price: 1400 });
    const buyer = await newShopper(browser, "rzp-refund");
    const owner = await signInAs(page, "superadmin", "rzp-refund-owner");
    try {
      await checkoutOnline(buyer.page, p.slug);
      await payInRazorpay(buyer.page, "Success");
      await buyer.page.waitForURL(/\/orders\//, { timeout: 90_000 });
      const paid = await latestOrder(buyer.user.id);
      expect(paid?.paymentStatus).toBe("paid");
      expect(await getStock(p.id)).toBe(0);

      await page.goto(`/admin/orders/${paid!.id}`);
      await page.getByRole("button", { name: "Cancel order" }).first().click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toContainText(/refunded/i);
      await dialog.getByRole("radio").first().check();
      await dialog.getByRole("button", { name: "Cancel order" }).click();
      await expect(page.getByText(`${paid!.orderNumber} cancelled and refunded.`)).toBeVisible({ timeout: 30_000 });

      const after = await latestOrder(buyer.user.id);
      expect(after?.orderStatus).toBe("cancelled");
      expect(["processing", "completed"]).toContain(after?.refundStatus);
      expect(await getStock(p.id), "the refunded piece did not go back on sale").toBe(1);
    } finally {
      await owner.dispose();
      await deleteOrdersForUser(buyer.user.id).catch(() => {});
      await buyer.user.dispose();
      await buyer.ctx.close();
      await deleteTestProduct(p.id);
    }
  });

  test("two people pay online for the last piece: one gets it, the other is told and queued for a refund", async ({ browser }) => {
    test.setTimeout(300_000);
    const p = await createTestProduct({ stock: 1, price: 1600 });
    const a = await newShopper(browser, "rzp-race-a");
    const b = await newShopper(browser, "rzp-race-b");
    try {
      // Both reach Razorpay while the piece is still in stock — online stock
      // is only taken when the money arrives, so neither is stopped here.
      await checkoutOnline(a.page, p.slug);
      await checkoutOnline(b.page, p.slug);

      await payInRazorpay(a.page, "Success");
      await a.page.waitForURL(/\/orders\//, { timeout: 90_000 });
      await payInRazorpay(b.page, "Success");
      await b.page.waitForTimeout(15_000);

      const oa = await latestOrder(a.user.id);
      const ob = await latestOrder(b.user.id);
      // What each order actually holds — so a failure says WHICH piece each
      // buyer paid for, not just that two orders were paid.
      const lines = await queryOne<{ j: unknown }>(
        `SELECT json_agg(json_build_object('buyer', CASE WHEN o."userId" = $1 THEN 'A' ELSE 'B' END,
                 'pay', o."paymentStatus", 'piece', oi."productId" = $3, 'name', oi."name")) j
           FROM "Order" o JOIN "OrderItem" oi ON oi."orderId" = o."id" WHERE o."userId" IN ($1, $2)`,
        [a.user.id, b.user.id, p.id]
      );
      test.info().annotations.push({ type: "race orders", description: JSON.stringify(lines?.j) });
      console.log("[race]", JSON.stringify(lines?.j), "stock", await getStock(p.id));
      expect(oa?.paymentStatus).toBe("paid");
      expect(ob?.paymentStatus, "the second buyer's order was confirmed for a sold-out piece").not.toBe("paid");
      expect(await getStock(p.id), "the last piece was sold twice").toBe(0);

      // B is told plainly, and B's money is where the refund job finds it.
      await expect(b.page.locator("body")).toContainText(/refund/i);
      expect(ob?.paymentStatus).toBe("failed");
      expect(ob?.razorpayPaymentId, "the second payment id was not kept — it could never be refunded").toMatch(/^pay_/);
      expect(["idle", "failed"]).toContain(ob?.refundStatus);
    } finally {
      for (const s of [a, b]) {
        await deleteOrdersForUser(s.user.id).catch(() => {});
        await s.user.dispose();
        await s.ctx.close();
      }
      await deleteTestProduct(p.id);
    }
  });
});
