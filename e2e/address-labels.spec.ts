import { test, expect } from "@playwright/test";
import crypto from "node:crypto";
import { signInAs, TEST_PASSWORD } from "./helpers/auth";
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
 * Address labels for the courier cover (owner's request, Nov 2026): a 4×6
 * label per page for the thermal printer, or four per A4 sheet. TO with a big
 * PIN, FROM the registered address, order number + QR, COD amount only on COD
 * orders, GIFT on gifts — and never a price otherwise.
 */

async function setup(n: number, extra: (i: number) => { cod?: boolean; gift?: boolean } = () => ({})) {
  const { id: userId } = await createTestUser({
    email: `e2e-labels-${crypto.randomBytes(4).toString("hex")}@example.test`,
    password: TEST_PASSWORD,
    role: "customer",
  });
  const product = await createTestProduct({ stock: 0, price: 1349 });
  const orders = [];
  for (let i = 0; i < n; i++) {
    const { cod, gift } = extra(i);
    const o = await insertOrderWithItem({
      userId,
      productId: product.id,
      name: product.name,
      price: 1349,
      paymentMethod: cod ? "cod" : "razorpay",
      paymentStatus: cod ? "pending" : "paid",
      orderStatus: cod ? "placed" : "confirmed",
    });
    if (gift) await queryOne(`UPDATE "Order" SET "isGift" = true WHERE "id" = $1 RETURNING 1`, [o.id]);
    orders.push(o);
  }
  return {
    orders,
    cleanup: async () => {
      await deleteOrdersForUser(userId).catch(() => {});
      await deleteUser(userId).catch(() => {});
      await deleteTestProduct(product.id);
    },
  };
}

test.describe("address labels", () => {
  test("from an order: one 4×6 label with TO, a big PIN, FROM, QR — and no price on a prepaid order", async ({ page }) => {
    const s = await setup(1);
    const admin = await signInAs(page, "admin", "labels-one");
    try {
      const o = s.orders[0];
      await page.goto(`/admin/orders/${o.id}`);
      await page.getByRole("link", { name: "Print address label" }).click();
      await expect(page).toHaveURL(new RegExp(`/admin/orders/labels\\?ids=${o.id}`));

      const label = page.locator(`[data-label="${o.orderNumber}"]`);
      await expect(label).toBeVisible({ timeout: 20_000 });
      await expect(label).toContainText("E2E Buyer");
      await expect(label).toContainText("12 Test Street");
      await expect(label.locator("[data-label-pin]")).toHaveText("PIN 641001");
      await expect(label).toContainText("Phone: 9876543210");
      await expect(label).toContainText("From");
      await expect(label).toContainText(o.orderNumber);
      await expect(label.locator("svg")).toHaveCount(1); // the QR code
      await expect(label.locator("[data-label-cod]")).toHaveCount(0);
      await expect(label, "a price is printed on a prepaid label").not.toContainText("₹");
      await expect(label).not.toContainText("GIFT");
    } finally {
      await admin.dispose();
      await s.cleanup();
    }
  });

  test("COD orders say how much to collect; gifts say GIFT", async ({ page }) => {
    const s = await setup(2, (i) => (i === 0 ? { cod: true } : { gift: true }));
    const admin = await signInAs(page, "admin", "labels-cod");
    try {
      const [cod, gift] = s.orders;
      await page.goto(`/admin/orders/labels?ids=${cod.id},${gift.id}`);
      await expect(page.locator(`[data-label="${cod.orderNumber}"] [data-label-cod]`)).toHaveText(/COD — Collect ₹1,349/, {
        timeout: 20_000,
      });
      await expect(page.locator(`[data-label="${gift.orderNumber}"]`)).toContainText("GIFT");
      await expect(page.locator(`[data-label="${gift.orderNumber}"] [data-label-cod]`)).toHaveCount(0);
    } finally {
      await admin.dispose();
      await s.cleanup();
    }
  });

  test("A4: four labels to a sheet — five orders make two sheets", async ({ page }) => {
    const s = await setup(5);
    const admin = await signInAs(page, "admin", "labels-a4");
    try {
      await page.goto(`/admin/orders/labels?ids=${s.orders.map((o) => o.id).join(",")}&size=a4`);
      await expect(page.locator("[data-label]")).toHaveCount(5, { timeout: 20_000 });
      const sheets = page.locator("[data-label-sheet] > div");
      await expect(sheets).toHaveCount(2);
      await expect(sheets.nth(0).locator("[data-label]")).toHaveCount(4);
      await expect(sheets.nth(1).locator("[data-label]")).toHaveCount(1);
    } finally {
      await admin.dispose();
      await s.cleanup();
    }
  });

  test("'all To ship' includes paid and COD orders waiting to go", async ({ page }) => {
    const s = await setup(2, (i) => ({ cod: i === 1 }));
    const admin = await signInAs(page, "admin", "labels-toship");
    try {
      await page.goto("/admin/orders");
      await page.getByRole("link", { name: /Print labels — all To ship/ }).click();
      await expect(page).toHaveURL(/toShip=1/);
      for (const o of s.orders) await expect(page.locator(`[data-label="${o.orderNumber}"]`)).toBeVisible({ timeout: 20_000 });
    } finally {
      await admin.dispose();
      await s.cleanup();
    }
  });

  test("printing shows only the labels", async ({ page }) => {
    const s = await setup(1);
    const admin = await signInAs(page, "admin", "labels-print");
    try {
      await page.goto(`/admin/orders/labels?ids=${s.orders[0].id}`);
      await expect(page.locator("[data-label]")).toBeVisible({ timeout: 20_000 });
      await page.emulateMedia({ media: "print" });
      const stray = await page.evaluate(() => {
        const sheet = document.querySelector("[data-label-sheet]")!;
        return [...document.body.querySelectorAll("*")]
          .filter((e) => !sheet.contains(e) && !e.contains(sheet) && getComputedStyle(e).display !== "none")
          .map((e) => e.tagName.toLowerCase())
          .slice(0, 5);
      });
      expect(stray, "admin screen parts would print with the labels").toEqual([]);
      await page.screenshot({ path: test.info().outputPath("label-4x6.png"), fullPage: true });
    } finally {
      await admin.dispose();
      await s.cleanup();
    }
  });

  test("customers and editors cannot open labels (they show addresses)", async ({ page, browser }) => {
    const s = await setup(1);
    try {
      for (const role of ["customer", "editor"] as const) {
        const ctx = await browser.newContext();
        const p = await ctx.newPage();
        const u = await signInAs(p, role, `labels-${role}`);
        await p.goto(`/admin/orders/labels?ids=${s.orders[0].id}`);
        await expect(p.locator("[data-label]"), `${role} saw a label`).toHaveCount(0);
        await expect(p.locator("body")).not.toContainText("641001");
        await u.dispose();
        await ctx.close();
      }
    } finally {
      await s.cleanup();
    }
    void page;
  });
});
