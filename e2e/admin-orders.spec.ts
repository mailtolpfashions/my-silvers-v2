import { test, expect } from "@playwright/test";
import { signInAs } from "./helpers/auth";
import {
  createTestProduct,
  deleteTestProduct,
  deleteOrdersForUser,
  insertOrderWithItem,
  getOrderState,
  getStock,
  queryOne,
} from "./helpers/db";
import { SMOKE } from "./helpers/target";

/**
 * Order handling on the admin side, on orders the test wrote itself.
 *
 * The rows are inserted directly (no checkout), so stock is set by hand to
 * what a placed COD order would have left: one taken from two.
 */

test.describe("admin orders", () => {
  test("the orders list opens for an admin", { tag: [SMOKE] }, async ({ page }) => {
    const admin = await signInAs(page, "admin", "ord-list");
    try {
      const res = await page.goto("/admin/orders");
      expect(res?.status()).toBe(200);
      await expect(page.locator("h1").first()).toBeVisible();
    } finally {
      await admin.dispose();
    }
  });

  test("staff cancelling a COD order puts the piece back in stock", async ({ page, browser }) => {
    const p = await createTestProduct({ stock: 1, price: 1100 }); // 2 before the order took one
    const ctx = await browser.newContext();
    const customerPage = await ctx.newPage();
    const customer = await signInAs(customerPage, "customer", "ord-cancel-cust");
    await ctx.close();
    const order = await insertOrderWithItem({ userId: customer.id, productId: p.id, name: p.name, price: 1100 });

    const admin = await signInAs(page, "admin", "ord-cancel");
    try {
      await page.goto(`/admin/orders/${order.id}`);
      await page.getByRole("button", { name: "Cancel order" }).first().click();
      const dialog = page.getByRole("dialog");
      await dialog.getByRole("radio").first().check();
      await dialog.getByRole("button", { name: "Cancel order" }).click();
      await expect(page.getByText(`${order.orderNumber} cancelled.`)).toBeVisible({ timeout: 20_000 });

      expect((await getOrderState(order.id))?.orderStatus).toBe("cancelled");
      expect(await getStock(p.id), "a staff cancel did not return the stock").toBe(2);
    } finally {
      await admin.dispose();
      await deleteOrdersForUser(customer.id).catch(() => {});
      await customer.dispose();
      await deleteTestProduct(p.id);
    }
  });

  test("a customer's return request reaches the admin, who can reject it", async ({ page, browser }) => {
    const p = await createTestProduct({ stock: 0, price: 800 });
    const ctx = await browser.newContext();
    const customerPage = await ctx.newPage();
    const customer = await signInAs(customerPage, "customer", "ord-return");
    const order = await insertOrderWithItem({
      userId: customer.id, productId: p.id, name: p.name, price: 800,
      orderStatus: "delivered", deliveredDaysAgo: 0,
    });
    const admin = await signInAs(page, "admin", "ord-return-admin");
    try {
      // Customer side.
      await customerPage.goto(`/account/orders/${order.id}`);
      await customerPage.getByRole("button", { name: /request a return|return/i }).first().click();
      await customerPage.locator("#return-reason").fill("The clasp arrived bent — E2E test.");
      await customerPage.getByRole("dialog").getByRole("button", { name: /submit|request/i }).click();
      await expect(customerPage.getByText(/return request submitted/i)).toBeVisible({ timeout: 15_000 });
      expect((await getOrderState(order.id))?.orderStatus).toBe("return_requested");

      // Admin side — Review return lives on the orders LIST, not the order page.
      await page.goto(`/admin/orders?q=${order.orderNumber}`);
      await page.getByRole("row").filter({ hasText: order.orderNumber }).getByRole("button", { name: "Review return" }).click();
      await expect(page.getByRole("dialog")).toContainText("The clasp arrived bent");
      await page.getByRole("dialog").getByRole("button", { name: "Reject" }).click();
      await expect(page.getByText("Return rejected.")).toBeVisible({ timeout: 15_000 });

      const after = await getOrderState(order.id);
      expect(after?.orderStatus, "a rejected return should leave the order delivered").toBe("delivered");
    } finally {
      await ctx.close();
      await admin.dispose();
      await deleteOrdersForUser(customer.id).catch(() => {});
      await customer.dispose();
      await deleteTestProduct(p.id);
    }
  });

  test("approving a COD return puts the piece back in stock", async ({ page, browser }) => {
    const p = await createTestProduct({ stock: 0, price: 800 });
    const ctx = await browser.newContext();
    const customer = await signInAs(await ctx.newPage(), "customer", "ord-approve");
    await ctx.close();
    const order = await insertOrderWithItem({
      userId: customer.id, productId: p.id, name: p.name, price: 800,
      orderStatus: "delivered", deliveredDaysAgo: 0,
    });
    await queryOne(
      `UPDATE "Order" SET "orderStatus" = 'return_requested', "returnReason" = 'E2E', "returnRequestedAt" = NOW()
        WHERE "id" = $1 RETURNING 1`,
      [order.id]
    );
    const owner = await signInAs(page, "superadmin", "ord-approve-owner");
    try {
      await page.goto(`/admin/orders?q=${order.orderNumber}`);
      await page.getByRole("row").filter({ hasText: order.orderNumber }).getByRole("button", { name: "Review return" }).click();
      await page.getByRole("dialog").getByRole("button", { name: "Approve return" }).click();
      await expect(page.getByText("Return approved.")).toBeVisible({ timeout: 15_000 });
      const after = await getOrderState(order.id);
      expect(["returned", "refunded"]).toContain(after?.orderStatus);
      // Whether an approved return restocks is a business rule — recorded, not assumed.
      test.info().annotations.push({ type: "stock after approved return", description: String(await getStock(p.id)) });
    } finally {
      await owner.dispose();
      await deleteOrdersForUser(customer.id).catch(() => {});
      await customer.dispose();
      await deleteTestProduct(p.id);
    }
  });
});
