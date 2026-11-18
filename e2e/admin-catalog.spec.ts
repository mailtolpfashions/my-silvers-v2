import { test, expect } from "@playwright/test";
import { signInAs } from "./helpers/auth";
import { createTestProduct, deleteTestProduct, getProductBySlug } from "./helpers/db";
import { SMOKE } from "./helpers/target";

/**
 * The catalogue work an admin does every day: change a price, change stock,
 * take a piece off the shop and put it back — and that each change reaches
 * the storefront, which is the only place it matters.
 *
 * Every test edits a product it created (slug e2e-…), never a real one.
 */

test.describe("admin catalogue", () => {
  test("the products list opens for an admin", { tag: [SMOKE] }, async ({ page }) => {
    const admin = await signInAs(page, "admin", "cat-list");
    try {
      const res = await page.goto("/admin/products");
      expect(res?.status()).toBe(200);
      await expect(page.getByRole("link", { name: "Add product" })).toBeVisible();
    } finally {
      await admin.dispose();
    }
  });

  test("editing price and stock saves, and the shop shows the new price", async ({ page }) => {
    const p = await createTestProduct({ stock: 2, price: 1000 });
    const admin = await signInAs(page, "admin", "cat-edit");
    try {
      await page.goto(`/admin/products/${p.id}`);
      await expect(page.locator("#price")).toBeVisible({ timeout: 20_000 });
      await page.locator("#price").fill("1777");
      await page.locator("#stock").fill("9");
      await page.getByRole("button", { name: "Save changes" }).click();
      await expect(page.getByText("Product updated.")).toBeVisible({ timeout: 20_000 });

      const row = await getProductBySlug(p.slug);
      expect(Number(row?.price), "price did not save").toBe(1777);
      expect(row?.stock, "stock did not save").toBe(9);

      await page.goto(`/products/${p.slug}`);
      await expect(page.locator("main")).toContainText("1,777");
    } finally {
      await admin.dispose();
      await deleteTestProduct(p.id);
    }
  });

  test("a negative price is refused", async ({ page }) => {
    const p = await createTestProduct({ stock: 2, price: 1000 });
    const admin = await signInAs(page, "admin", "cat-neg");
    try {
      await page.goto(`/admin/products/${p.id}`);
      await expect(page.locator("#price")).toBeVisible({ timeout: 20_000 });
      await page.locator("#price").fill("-50");
      await page.getByRole("button", { name: "Save changes" }).click();
      await page.waitForTimeout(2500);
      expect(Number((await getProductBySlug(p.slug))?.price), "a negative price was saved").toBe(1000);
    } finally {
      await admin.dispose();
      await deleteTestProduct(p.id);
    }
  });

  test("archive takes a piece off the shop; restore puts it back", async ({ page }) => {
    const p = await createTestProduct({ stock: 2 });
    const admin = await signInAs(page, "admin", "cat-archive");
    try {
      await page.goto(`/admin/products?q=${encodeURIComponent(p.name)}`);
      const row = page.getByRole("row").filter({ hasText: p.name });
      await expect(row).toBeVisible({ timeout: 20_000 });
      await row.getByRole("button", { name: "Archive" }).click();
      await expect(page.getByText("Product archived.")).toBeVisible({ timeout: 15_000 });
      expect((await getProductBySlug(p.slug))?.isActive).toBe(false);

      await page.goto(`/products/${p.slug}`);
      await expect(page.locator("h1").filter({ hasText: p.name }), "an archived piece is still on sale").toHaveCount(0);

      await page.goto(`/admin/products?q=${encodeURIComponent(p.name)}&active=inactive`);
      const archived = page.getByRole("row").filter({ hasText: p.name });
      await archived.getByRole("button", { name: "Restore" }).click();
      await expect(page.getByText("Product restored.")).toBeVisible({ timeout: 15_000 });
      expect((await getProductBySlug(p.slug))?.isActive).toBe(true);
    } finally {
      await admin.dispose();
      await deleteTestProduct(p.id);
    }
  });

  test("an admin (the owner's partner) can see the cost price", async ({ page }) => {
    const p = await createTestProduct({ stock: 1 });
    const admin = await signInAs(page, "admin", "cat-cost");
    try {
      await page.goto(`/admin/products/${p.id}`);
      await expect(page.locator("#price")).toBeVisible({ timeout: 20_000 });
      await expect(page.getByText(/cost price/i).first()).toBeVisible();
    } finally {
      await admin.dispose();
      await deleteTestProduct(p.id);
    }
  });

  test("an editor cannot open the product editor at all", async ({ page }) => {
    const p = await createTestProduct({ stock: 1 });
    const editor = await signInAs(page, "editor", "cat-editor");
    try {
      await page.goto(`/admin/products/${p.id}`);
      await expect(page).not.toHaveURL(new RegExp(`/admin/products/${p.id}`));
      const body = await page.locator("body").innerText();
      expect(body.toLowerCase(), "an editor saw costing").not.toContain("cost price");
    } finally {
      await editor.dispose();
      await deleteTestProduct(p.id);
    }
  });
});
