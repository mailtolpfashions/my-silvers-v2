import { test, expect } from "@playwright/test";
import crypto from "node:crypto";
import { TEST_PASSWORD } from "./helpers/auth";
import {
  createTestUser,
  deleteUser,
  createTestProduct,
  deleteTestProduct,
  deleteOrdersForUser,
  insertOrderWithItem,
  queryOne,
} from "./helpers/db";

/**
 * The invoice link in order emails (partners' request, Nov 2026). A guest —
 * no account — opens their invoice with the order's private ?ot= token, the
 * same key as their order page. Only that token, for that order, opens it.
 */

const NOT_FOUND = /couldn't find|not found|could not find|isn't available/i;

async function guestOrder(opts: { orderStatus?: "placed" | "shipped" | "cancelled" } = {}) {
  const { id: userId } = await createTestUser({
    email: `e2e-guestinv-${crypto.randomBytes(4).toString("hex")}@example.test`,
    password: TEST_PASSWORD,
    role: "customer",
  });
  const product = await createTestProduct({ stock: 0, price: 1250 });
  const order = await insertOrderWithItem({
    userId,
    productId: product.id,
    name: product.name,
    price: 1250,
    orderStatus: opts.orderStatus ?? "shipped",
  });
  const token = crypto.randomBytes(24).toString("hex");
  await queryOne(`UPDATE "Order" SET "confirmationToken" = $2 WHERE "id" = $1 RETURNING 1`, [order.id, token]);
  return {
    ...order,
    token,
    product,
    cleanup: async () => {
      await deleteOrdersForUser(userId).catch(() => {});
      await deleteUser(userId).catch(() => {});
      await deleteTestProduct(product.id);
    },
  };
}

test.describe("guest invoice link", () => {
  test("the emailed link opens the invoice without signing in, and downloads the PDF", async ({ page }) => {
    const o = await guestOrder();
    try {
      await page.goto(`/orders/${o.id}/invoice?ot=${o.token}`);
      await expect(page.locator("[data-invoice]")).toBeVisible({ timeout: 20_000 });
      await expect(page.locator("[data-invoice]")).toContainText(o.orderNumber);
      await expect(page.locator("[data-invoice]")).toContainText(o.product.name);
      await expect(page.locator('meta[name="robots"][content*="noindex"]').first()).toBeAttached();

      const [download] = await Promise.all([
        page.waitForEvent("download", { timeout: 60_000 }),
        page.getByRole("button", { name: "Download PDF" }).click(),
      ]);
      expect(download.suggestedFilename()).toBe(`${o.orderNumber}-invoice.pdf`);
    } finally {
      await o.cleanup();
    }
  });

  test("no token, a wrong token, or another order's token opens nothing", async ({ page }) => {
    const a = await guestOrder();
    const b = await guestOrder();
    try {
      for (const url of [
        `/orders/${a.id}/invoice`,
        `/orders/${a.id}/invoice?ot=${"0".repeat(48)}`,
        `/orders/${a.id}/invoice?ot=${b.token}`,
      ]) {
        await page.goto(url);
        await expect(page.locator("main"), `${url} showed an invoice`).toContainText(NOT_FOUND, { timeout: 15_000 });
        await expect(page.locator("[data-invoice]")).toHaveCount(0);
        await expect(page.locator("body")).not.toContainText(a.orderNumber);
      }
    } finally {
      await a.cleanup();
      await b.cleanup();
    }
  });

  test("a cancelled order has no invoice, even with the right token", async ({ page }) => {
    const o = await guestOrder({ orderStatus: "cancelled" });
    try {
      await page.goto(`/orders/${o.id}/invoice?ot=${o.token}`);
      await expect(page.locator("main")).toContainText(NOT_FOUND, { timeout: 15_000 });
      await expect(page.locator("[data-invoice]")).toHaveCount(0);
    } finally {
      await o.cleanup();
    }
  });

  test("the guest order page links to its invoice", async ({ page }) => {
    const o = await guestOrder();
    try {
      await page.goto(`/orders/${o.id}?ot=${o.token}`);
      const link = page.getByRole("link", { name: "View tax invoice" });
      await expect(link).toBeVisible({ timeout: 20_000 });
      await link.click();
      await expect(page).toHaveURL(new RegExp(`/orders/${o.id}/invoice\\?ot=${o.token}`));
      await expect(page.locator("[data-invoice]")).toContainText(o.orderNumber);
    } finally {
      await o.cleanup();
    }
  });
});
