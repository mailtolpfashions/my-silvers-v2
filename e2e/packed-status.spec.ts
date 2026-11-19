import { test, expect, type Browser } from "@playwright/test";
import crypto from "node:crypto";
import { signInAs, TEST_PASSWORD } from "./helpers/auth";
import {
  createTestUser,
  deleteUser,
  createTestProduct,
  deleteTestProduct,
  deleteOrdersForUser,
  insertOrderWithItem,
  getOrderState,
  queryOne,
} from "./helpers/db";

/**
 * Placed / Confirmed → PACKED → Shipped → Delivered (owner's decision,
 * Nov 2026). "Packed" is stored as `processing`; any admin can mark it.
 */

type Kind = "paid" | "cod" | "unpaid" | "shipped" | "cancelled";

async function setup(kinds: Kind[]) {
  const email = `e2e-packed-${crypto.randomBytes(4).toString("hex")}@example.test`;
  const { id: userId } = await createTestUser({ email, password: TEST_PASSWORD, role: "customer" });
  const product = await createTestProduct({ stock: 0, price: 1100 });
  const orders: Record<string, { id: string; orderNumber: string }> = {};
  for (const k of kinds) {
    const o = await insertOrderWithItem({
      userId,
      productId: product.id,
      name: product.name,
      price: 1100,
      paymentMethod: k === "cod" ? "cod" : "razorpay",
      paymentStatus: k === "paid" || k === "shipped" ? "paid" : "pending",
      orderStatus: k === "shipped" ? "shipped" : k === "cancelled" ? "cancelled" : k === "cod" ? "placed" : "confirmed",
    });
    if (k === "shipped") await queryOne(`UPDATE "Order" SET "shipmentCreatedAt" = NOW() WHERE "id" = $1 RETURNING 1`, [o.id]);
    orders[k] = o;
  }
  return {
    email,
    userId,
    orders,
    cleanup: async () => {
      await deleteOrdersForUser(userId).catch(() => {});
      await deleteUser(userId).catch(() => {});
      await deleteTestProduct(product.id);
    },
  };
}

async function asCustomer(browser: Browser, email: string) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20_000 });
  return { page, close: () => ctx.close() };
}

test.describe("packed status", () => {
  test("an admin marks a paid order packed; the admin sees Packed, the customer still sees Order confirmed, and it can still ship", async ({ page, browser }) => {
    const s = await setup(["paid"]);
    const admin = await signInAs(page, "admin", "packed-admin");
    try {
      const o = s.orders.paid;
      await page.goto(`/admin/orders/${o.id}`);
      await page.getByRole("button", { name: "Mark as packed" }).click();
      await expect(page.getByText("Marked as packed.")).toBeVisible({ timeout: 15_000 });
      expect((await getOrderState(o.id))?.orderStatus).toBe("processing");

      await page.reload();
      await expect(page.getByRole("button", { name: "Mark as packed" })).toHaveCount(0);
      await expect(page.locator("main")).toContainText("Packed");
      await expect(page.getByRole("button", { name: /ship order/i }).first(), "a packed order can't be shipped").toBeVisible();

      const customer = await asCustomer(browser, s.email);
      await customer.page.goto(`/account/orders/${o.id}`);
      // Packed is the shop's own step — the customer's flow is Order confirmed
      // → Shipped → Out for delivery → Delivered (owner's decision, Nov 2026).
      await expect(customer.page.locator("main")).toContainText("Order confirmed", { timeout: 20_000 });
      await expect(customer.page.locator("main")).not.toContainText("Packed");
      await expect(customer.page.locator("main")).not.toContainText("Processing");
      // Still cancellable by the customer until it ships.
      await expect(customer.page.getByRole("button", { name: "Cancel order" })).toBeVisible();
      await customer.close();
    } finally {
      await admin.dispose();
      await s.cleanup();
    }
  });

  test("the 'To pack' filter lists unpacked paid and COD orders — not unpaid, shipped or cancelled ones", async ({ page }) => {
    const s = await setup(["paid", "cod", "unpaid", "shipped", "cancelled"]);
    const admin = await signInAs(page, "admin", "packed-filter");
    try {
      await page.goto(`/admin/orders?status=to_pack&q=${encodeURIComponent(s.email)}`);
      const main = page.locator("main");
      await expect(main).toContainText(s.orders.paid.orderNumber, { timeout: 20_000 });
      await expect(main).toContainText(s.orders.cod.orderNumber);
      for (const k of ["unpaid", "shipped", "cancelled"] as const) {
        await expect(main, `${k} order is in To pack`).not.toContainText(s.orders[k].orderNumber);
      }

      // Packing one from the list takes it out of the pile.
      await page.getByRole("row").filter({ hasText: s.orders.cod.orderNumber }).getByRole("button", { name: "Packed" }).click();
      await expect(page.getByText("Marked as packed.")).toBeVisible({ timeout: 15_000 });
      await page.reload();
      await expect(main).not.toContainText(s.orders.cod.orderNumber);
      expect((await getOrderState(s.orders.cod.id))?.orderStatus).toBe("processing");
    } finally {
      await admin.dispose();
      await s.cleanup();
    }
  });

  test("labels page: 'Mark all as packed' packs only the orders that can be packed", async ({ page }) => {
    const s = await setup(["paid", "cod", "shipped"]);
    const admin = await signInAs(page, "admin", "packed-labels");
    try {
      const ids = [s.orders.paid.id, s.orders.cod.id, s.orders.shipped.id];
      await page.goto(`/admin/orders/labels?ids=${ids.join(",")}`);
      await page.getByRole("button", { name: "Mark all 2 as packed" }).click();
      await expect(page.getByText("2 orders marked as packed.")).toBeVisible({ timeout: 15_000 });
      expect((await getOrderState(s.orders.paid.id))?.orderStatus).toBe("processing");
      expect((await getOrderState(s.orders.cod.id))?.orderStatus).toBe("processing");
      expect((await getOrderState(s.orders.shipped.id))?.orderStatus, "a shipped order was moved back to packed").toBe("shipped");
      await page.reload();
      await expect(page.getByRole("button", { name: /as packed/ })).toHaveCount(0);
    } finally {
      await admin.dispose();
      await s.cleanup();
    }
  });

  test("an unpaid online order offers no 'Mark as packed'", async ({ page }) => {
    const s = await setup(["unpaid"]);
    const admin = await signInAs(page, "admin", "packed-unpaid");
    try {
      await page.goto(`/admin/orders/${s.orders.unpaid.id}`);
      await expect(page.locator("main")).toContainText(s.orders.unpaid.orderNumber, { timeout: 20_000 });
      await expect(page.getByRole("button", { name: "Mark as packed" })).toHaveCount(0);
    } finally {
      await admin.dispose();
      await s.cleanup();
    }
  });
});
