import { test, expect } from "@playwright/test";
import crypto from "node:crypto";
import { signInAs } from "./helpers/auth";
import { SHIPROCKET_TEST_TOKEN } from "../playwright.config";
import {
  createTestProduct,
  deleteTestProduct,
  deleteOrdersForUser,
  insertOrderWithItem,
  getOrderState,
  queryOne,
} from "./helpers/db";

/**
 * The customer's flow (owner's decision, Nov 2026):
 *   Order confirmed → Shipped → Out for delivery → Delivered
 * with an email at every step. Emails never leave a test run; the test server
 * notes each one it WOULD have sent (EmailSend, error "e2e-dry-run:<to>"),
 * which is what these tests count.
 */

async function emailsTo(email: string, kind: string): Promise<number> {
  const row = await queryOne<{ n: number }>(
    `SELECT count(*)::int n FROM "EmailSend" WHERE "kind" = $1 AND "error" = $2`,
    [kind, `e2e-dry-run:${email}`]
  );
  return row?.n ?? 0;
}

function courierPush(awb: string, status: string, activity: string) {
  return {
    awb,
    current_status: status,
    courier_name: "delhivery",
    scans: [{ date: new Date().toISOString(), activity, location: "Bangalore_Hub_DC" }],
  };
}

test.describe("customer flow and emails", () => {
  test("courier says out for delivery → the customer sees it and gets ONE email; then delivered → one delivered email", async ({ page, request }) => {
    const p = await createTestProduct({ stock: 0, price: 1499 });
    const user = await signInAs(page, "customer", "ofd");
    const awb = `E2E${crypto.randomInt(1e9, 9e9)}`;
    const o = await insertOrderWithItem({ userId: user.id, productId: p.id, name: p.name, price: 1499, orderStatus: "shipped" });
    await queryOne(
      `UPDATE "Order" SET "trackingNumber" = $2, "courierName" = 'delhivery', "shipmentCreatedAt" = NOW() WHERE "id" = $1 RETURNING 1`,
      [o.id, awb]
    );
    const headers = { "content-type": "application/json", "x-api-key": SHIPROCKET_TEST_TOKEN };
    try {
      await page.goto(`/account/orders/${o.id}`);
      await expect(page.locator("main")).toContainText("Shipped", { timeout: 20_000 });

      // Out for delivery — twice, as couriers often repeat themselves.
      for (let i = 0; i < 2; i++) {
        const res = await request.post("/api/webhooks/shiprocket", {
          headers,
          data: courierPush(awb, "OUT FOR DELIVERY", "Out For Delivery"),
        });
        expect(res.status()).toBe(200);
      }
      await expect.poll(() => emailsTo(user.email, "order-out-for-delivery"), { timeout: 15_000 }).toBe(1);
      await page.waitForTimeout(1500);
      expect(await emailsTo(user.email, "order-out-for-delivery"), "out-for-delivery email sent twice").toBe(1);

      await page.reload();
      await expect(page.locator("main")).toContainText("Out for delivery", { timeout: 20_000 });

      // Delivered.
      const res = await request.post("/api/webhooks/shiprocket", { headers, data: courierPush(awb, "DELIVERED", "Delivered") });
      expect(res.status()).toBe(200);
      await expect.poll(async () => (await getOrderState(o.id))?.orderStatus).toBe("delivered");
      await expect.poll(() => emailsTo(user.email, "order-delivered"), { timeout: 15_000 }).toBe(1);
      expect(await emailsTo(user.email, "order-out-for-delivery")).toBe(1);

      await page.reload();
      await expect(page.locator("main")).toContainText("Delivered");
    } finally {
      await deleteOrdersForUser(user.id).catch(() => {});
      await user.dispose();
      await deleteTestProduct(p.id);
    }
  });

  test("delivered straight away (no out-for-delivery scan) sends only the delivered email", async ({ page, request }) => {
    const p = await createTestProduct({ stock: 0, price: 999 });
    const user = await signInAs(page, "customer", "ofd-skip");
    const awb = `E2E${crypto.randomInt(1e9, 9e9)}`;
    const o = await insertOrderWithItem({ userId: user.id, productId: p.id, name: p.name, price: 999, orderStatus: "shipped" });
    await queryOne(`UPDATE "Order" SET "trackingNumber" = $2, "shipmentCreatedAt" = NOW() WHERE "id" = $1 RETURNING 1`, [o.id, awb]);
    try {
      await request.post("/api/webhooks/shiprocket", {
        headers: { "content-type": "application/json", "x-api-key": SHIPROCKET_TEST_TOKEN },
        data: courierPush(awb, "DELIVERED", "Delivered"),
      });
      await expect.poll(() => emailsTo(user.email, "order-delivered"), { timeout: 15_000 }).toBe(1);
      expect(await emailsTo(user.email, "order-out-for-delivery")).toBe(0);
    } finally {
      await deleteOrdersForUser(user.id).catch(() => {});
      await user.dispose();
      await deleteTestProduct(p.id);
    }
  });

  test("the owner marking an order Shipped by hand emails the customer too", async ({ page, browser }) => {
    const p = await createTestProduct({ stock: 0, price: 999 });
    const ctx = await browser.newContext();
    const customer = await signInAs(await ctx.newPage(), "customer", "manual-ship");
    await ctx.close();
    const o = await insertOrderWithItem({
      userId: customer.id, productId: p.id, name: p.name, price: 999,
      paymentMethod: "razorpay", paymentStatus: "paid", orderStatus: "confirmed",
    });
    // Packed — the step right before the owner ships it.
    await queryOne(`UPDATE "Order" SET "orderStatus" = 'processing' WHERE "id" = $1 RETURNING 1`, [o.id]);
    const owner = await signInAs(page, "superadmin", "manual-ship-owner");
    try {
      await page.goto(`/admin/orders/${o.id}`);
      const select = page.getByRole("combobox").first();
      await select.click();
      await page.getByRole("option", { name: "Shipped" }).click();
      await expect(page.getByText("Status updated.")).toBeVisible({ timeout: 15_000 });
      await expect.poll(() => emailsTo(customer.email, "order-shipped"), { timeout: 15_000 }).toBe(1);
    } finally {
      await owner.dispose();
      await deleteOrdersForUser(customer.id).catch(() => {});
      await customer.dispose();
      await deleteTestProduct(p.id);
    }
  });
});
