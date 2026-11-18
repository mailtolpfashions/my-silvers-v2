import { test, expect } from "@playwright/test";
import { signInAs } from "./helpers/auth";
import { createTestProduct, deleteTestProduct, queryOne } from "./helpers/db";
import { SMOKE } from "./helpers/target";
import { pieceAddButton } from "./helpers/ui";

/**
 * The product page — what a shopper does on it.
 *
 * Each test makes its OWN product, so stock is known exactly. That matters
 * here more than anywhere: most pieces in this shop are one-offs (stock 1),
 * and the rules for a one-off are the ones most worth proving.
 */

const addButton = pieceAddButton;

test.describe("product page", () => {
  test("shows name and price, and adds to the cart", { tag: [SMOKE] }, async ({ page }) => {
    const p = await createTestProduct({ stock: 3, price: 2499 });
    try {
      await page.goto(`/products/${p.slug}`);
      await expect(page.locator("h1")).toHaveText(p.name);
      await expect(page.locator("main")).toContainText("2,499");

      const add = addButton(page);
      await expect(add).toBeEnabled({ timeout: 20_000 });
      await add.click();
      await expect(
        page.getByRole("button", { name: /added to cart|in cart/i }).locator("visible=true").first()
      ).toBeVisible();

      await page.goto("/cart");
      await expect(page.locator("main")).toContainText(p.name);
    } finally {
      await deleteTestProduct(p.id);
    }
  });

  test("a piece with no description still shares with preview text", async ({ page }) => {
    // createTestProduct writes no description at all — the worst case.
    const p = await createTestProduct({ stock: 1, price: 1499 });
    try {
      await page.goto(`/products/${p.slug}`);
      const og = await page.locator('meta[property="og:description"]').getAttribute("content");
      expect(og, "no og:description — WhatsApp shows a bare title").toBeTruthy();
      expect(og).toContain("1,499");
    } finally {
      await deleteTestProduct(p.id);
    }
  });

  test("a one-off piece (stock 1) cannot be added twice", async ({ page }) => {
    const p = await createTestProduct({ stock: 1 });
    try {
      await page.goto(`/products/${p.slug}`);
      await expect(addButton(page)).toBeEnabled({ timeout: 20_000 });
      await addButton(page).click();

      // The button must stop offering a second unit it cannot sell.
      const after = page.getByRole("button", { name: /added to cart|in cart/i }).locator("visible=true").first();
      await expect(after).toBeVisible();
      await expect(after).toBeDisabled();

      // And the cart's + must not take it past stock either.
      await page.goto("/cart");
      const plus = page.getByRole("button", { name: "Increase quantity" }).first();
      if (await plus.isEnabled()) {
        await plus.click();
        await page.waitForTimeout(1500);
      }
      await page.reload();
      await expect(page.locator("main")).not.toContainText(/qty:?\s*2|×\s*2/i);
      const qtyText = await page.locator("main").innerText();
      expect(qtyText, "cart holds 2 of a stock-1 piece").not.toMatch(/\b2\s*(items|pieces)\b/i);
    } finally {
      await deleteTestProduct(p.id);
    }
  });

  test("a sold-out piece cannot be bought, only watched", async ({ page }) => {
    const p = await createTestProduct({ stock: 0 });
    try {
      await page.goto(`/products/${p.slug}`);
      await expect(page.locator("h1")).toHaveText(p.name);
      const notify = page.getByRole("button", { name: /notify me/i }).locator("visible=true").first();
      await expect(notify).toBeVisible();
      // Scoped to this piece's own buy box: the page also shows OTHER products
      // (recently viewed, recommendations) with their own Add to cart.
      const buyBox = page.locator("h1").locator("xpath=ancestor::*[.//button[contains(., 'Notify me')]][1]");
      await expect(buyBox.getByRole("button", { name: /add to (cart|bag)/i })).toHaveCount(0);
    } finally {
      await deleteTestProduct(p.id);
    }
  });

  test("a guest can ask to be told when a sold-out piece is back", async ({ page }) => {
    const p = await createTestProduct({ stock: 0 });
    const email = `e2e-notify-${Date.now()}@example.test`;
    try {
      await page.goto(`/products/${p.slug}`);
      await page.getByRole("button", { name: /notify me/i }).locator("visible=true").first().click();
      await page.getByLabel("Email address for a back-in-stock alert").fill(email);
      await page.getByRole("dialog").getByRole("button", { name: "Notify me" }).click();
      await expect(page.getByText(/the moment it's back/i)).toBeVisible();

      const row = await queryOne(`SELECT 1 FROM "StockNotification" WHERE "productId" = $1 AND "email" = $2`, [p.id, email]);
      expect(row, "the alert was not saved").not.toBeNull();
    } finally {
      await deleteTestProduct(p.id);
    }
  });

  test("an archived piece is not for sale", async ({ page }) => {
    const p = await createTestProduct({ stock: 5, isActive: false });
    try {
      await page.goto(`/products/${p.slug}`);
      const body = (await page.textContent("body"))?.toLowerCase() ?? "";
      expect(body).toMatch(/not found|couldn't find|could not find|does not exist|no longer available|isn't available/);
      await expect(page.locator("h1").filter({ hasText: p.name })).toHaveCount(0);
    } finally {
      await deleteTestProduct(p.id);
    }
  });

  test("a guest who taps the heart is sent to sign in", async ({ page }) => {
    const p = await createTestProduct({ stock: 2 });
    try {
      await page.goto(`/products/${p.slug}`);
      await expect(addButton(page)).toBeEnabled({ timeout: 20_000 });
      await page.getByRole("button", { name: "Add to wishlist" }).locator("visible=true").first().click();
      await expect(page).toHaveURL(/\/login\?redirect=/);
    } finally {
      await deleteTestProduct(p.id);
    }
  });

  test("a signed-in shopper can save and unsave a piece", async ({ page }) => {
    const p = await createTestProduct({ stock: 2 });
    const user = await signInAs(page, "customer", "wishlist");
    try {
      await page.goto(`/products/${p.slug}`);
      await expect(addButton(page)).toBeEnabled({ timeout: 20_000 });
      await page.getByRole("button", { name: "Add to wishlist" }).locator("visible=true").first().click();
      await expect(page.getByText("Added to wishlist")).toBeVisible();

      await page.goto("/wishlist");
      await expect(page.locator("main")).toContainText(p.name);

      await page.goto(`/products/${p.slug}`);
      await page.getByRole("button", { name: "Remove from wishlist" }).locator("visible=true").first().click();
      await expect(page.getByText("Removed from wishlist")).toBeVisible();
      await page.goto("/wishlist");
      await expect(page.locator("main")).not.toContainText(p.name);
    } finally {
      await user.dispose();
      await deleteTestProduct(p.id);
    }
  });
});
