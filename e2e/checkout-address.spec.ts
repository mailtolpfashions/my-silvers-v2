import { test, expect, type Page } from "@playwright/test";
import crypto from "node:crypto";
import { signInAs } from "./helpers/auth";
import { createTestProduct, deleteTestProduct, createCoupon, deleteCoupon, queryOne } from "./helpers/db";
import { pieceAddButton } from "./helpers/ui";

/**
 * Switching the delivery address at checkout must not make the order summary
 * jump about.
 *
 * Reported Nov 2026 by the owner: choosing "Deliver to a different address"
 * (or another saved address) made the summary refresh and the coupon act up.
 * Each switch changes the mobile number, which re-checks the coupon, and
 * while it re-checked the discount showed as ₹0 — measured: total ₹1,350 →
 * ₹1,500 → ₹1,350 on every switch.
 */

const totalOf = async (page: Page) => (await page.locator("main").innerText()).match(/Total\s*₹([\d,.]+)/)?.[1] ?? "?";

test("switching delivery address keeps the coupon and the total steady", async ({ page }) => {
  test.setTimeout(120_000);
  const p = await createTestProduct({ stock: 3, price: 1500 });
  const code = `E2EADDR${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
  await createCoupon({ code, type: "percent", value: 10 });
  const user = await signInAs(page, "customer", "addr-switch");
  for (const [name, phone, isDefault] of [
    ["Home", "8925014736", true],
    ["Office", "9445566778", false],
  ] as const) {
    await queryOne(
      `INSERT INTO "Address" ("id", "userId", "fullName", "phone", "addressLine1", "city", "state", "pincode", "isDefault")
       VALUES ($1, $2, $3, $4, '4 Car Street', 'Chengam', 'Tamil Nadu', '606701', $5) RETURNING 1`,
      [`e2e_${crypto.randomBytes(8).toString("hex")}`, user.id, name, phone, isDefault]
    );
  }
  try {
    await page.goto(`/products/${p.slug}`);
    await pieceAddButton(page).click();
    await expect(page.locator("[data-sonner-toast]").filter({ hasText: /added to cart/i }).first()).toBeVisible({ timeout: 20_000 });
    await page.evaluate((c) => localStorage.setItem("mys-coupon", c), code);
    await page.goto("/checkout");
    await expect(page.locator("main")).toContainText(code, { timeout: 20_000 });
    // ₹1,500 − 10% = ₹1,350 (free shipping above the threshold).
    await expect.poll(() => totalOf(page), { timeout: 15_000 }).toBe("1,350");

    const options = [
      page.locator("label").filter({ hasText: "Office" }).getByRole("radio"),
      page.locator("label").filter({ hasText: "Home" }).getByRole("radio"),
      page.getByRole("radio", { name: /deliver to a different address/i }),
    ];
    for (const option of options) {
      await option.check({ force: true });
      const seen = new Set<string>();
      for (let i = 0; i < 20; i++) {
        seen.add(await totalOf(page));
        await expect(page.locator("main"), "the coupon flashed 'checking…'").not.toContainText(/checking…/);
        await page.waitForTimeout(100);
      }
      expect([...seen], "the total jumped while the address changed").toEqual(["1,350"]);
    }
  } finally {
    await user.dispose();
    await deleteCoupon(code);
    await deleteTestProduct(p.id);
  }
});
