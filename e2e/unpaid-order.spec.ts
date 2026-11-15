import { test, expect } from "@playwright/test";
import { signInAs } from "./helpers/auth";
import { deleteOrdersForUser, insertUnpaidOnlineOrder } from "./helpers/db";

/**
 * A shopper who pressed Pay and then closed Razorpay leaves an order that was
 * never paid for. It used to sit in "Your orders" as an ordinary "Placed".
 * It must say what it is, and offer to finish paying while it still can.
 */
test.describe("an order whose payment was never completed", () => {
  test("is labelled as unpaid in the order list, not 'Placed'", async ({ page }) => {
    const me = await signInAs(page, "customer", "unpaid-list");
    try {
      const { orderNumber } = await insertUnpaidOnlineOrder(me.id);
      await page.goto("/account/orders");
      const row = page.getByRole("link").filter({ hasText: orderNumber });
      await expect(row).toContainText(/payment not completed/i);
      await expect(row).not.toContainText(/^placed$/i);
    } finally {
      await deleteOrdersForUser(me.id);
      await me.dispose();
    }
  });

  test("offers Pay now inside the payment window", async ({ page }) => {
    const me = await signInAs(page, "customer", "unpaid-paynow");
    try {
      const { id } = await insertUnpaidOnlineOrder(me.id, 1);
      await page.goto(`/account/orders/${id}`);
      await expect(page.getByText(/haven.t been charged/i).first()).toBeVisible();
      await expect(page.getByRole("button", { name: /pay now/i })).toBeVisible();
    } finally {
      await deleteOrdersForUser(me.id);
      await me.dispose();
    }
  });

  test("withdraws Pay now once the window has passed", async ({ page }) => {
    const me = await signInAs(page, "customer", "unpaid-expired");
    try {
      const { id } = await insertUnpaidOnlineOrder(me.id, 30);
      await page.goto(`/account/orders/${id}`);
      await expect(page.getByText(/time to pay for this order has passed/i)).toBeVisible();
      await expect(page.getByRole("button", { name: /pay now/i })).toHaveCount(0);
    } finally {
      await deleteOrdersForUser(me.id);
      await me.dispose();
    }
  });
});
