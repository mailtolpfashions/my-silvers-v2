import { test, expect } from "@playwright/test";
import { signInAs } from "./helpers/auth";
import { createTestProduct, deleteTestProduct, deleteOrdersForUser, insertOrderWithItem, queryOne } from "./helpers/db";

/**
 * Courier text reads like the shop, not like a courier's database (owner's
 * screenshot, Nov 2026: "shipped", "booked", "delhivery",
 * "Uthangarai_Singarapettai_D").
 */
test("the tracking timeline capitalises statuses, names the courier properly and tidies hub names", async ({ page }) => {
  const p = await createTestProduct({ stock: 0, price: 999 });
  const user = await signInAs(page, "customer", "tracking-text");
  const o = await insertOrderWithItem({ userId: user.id, productId: p.id, name: p.name, price: 999, orderStatus: "shipped" });
  const scans = [
    { at: "2026-11-19T04:00:00.000Z", activity: "Pickup scheduled", location: "Uthangarai_Singarapettai_D (Tamil Nadu)" },
    { at: "2026-11-19T04:00:00.000Z", activity: "shipped", location: null },
    { at: "2026-11-19T04:00:00.000Z", activity: "booked", location: null },
    { at: "2026-11-19T04:00:00.000Z", activity: "IN TRANSIT", location: "Bangalore_Hub_DC" },
  ];
  await queryOne(
    `UPDATE "Order" SET "trackingNumber" = '236454102833016', "courierName" = 'delhivery', "shipmentCreatedAt" = NOW(),
       "shipmentScans" = $2::jsonb WHERE "id" = $1 RETURNING 1`,
    [o.id, JSON.stringify(scans)]
  );
  try {
    await page.goto(`/account/orders/${o.id}`);
    const main = page.locator("main");
    await expect(main).toContainText("Delhivery — 236454102833016", { timeout: 20_000 });
    for (const t of ["Pickup scheduled", "Shipped", "Booked", "In transit", "Uthangarai Singarapettai (Tamil Nadu)", "Bangalore Hub"]) {
      await expect(main).toContainText(t);
    }
    for (const raw of ["delhivery —", "_D", "Bangalore_Hub", "IN TRANSIT"]) {
      await expect(main, `raw courier text "${raw}" is showing`).not.toContainText(raw);
    }
    await expect(main.getByText("shipped", { exact: true })).toHaveCount(0);
    await expect(main.getByText("booked", { exact: true })).toHaveCount(0);
  } finally {
    await deleteOrdersForUser(user.id).catch(() => {});
    await user.dispose();
    await deleteTestProduct(p.id);
  }
});
