import { test, expect, type Page } from "@playwright/test";
import { getInStockProduct, createCoupon, deleteCoupon } from "./helpers/db";

/**
 * Coupons in the cart — see src/server/coupons/coupons.ts.
 *
 * The test that places a real order with a code lives in commerce.spec.ts:
 * it switches COD on, and that file runs serially so settings changes cannot
 * collide. This file changes no settings and can run alongside anything.
 */

const stamp = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`.toUpperCase();

async function addToCartAndOpen(page: Page, slug: string) {
  await page.goto(`/products/${slug}`);
  const add = page.getByRole("button", { name: /add to (cart|bag)/i }).locator("visible=true");
  await expect(add.first()).toBeVisible({ timeout: 20_000 });
  await add.first().click();
  await expect(page.getByText(/added to cart/i).first()).toBeVisible({ timeout: 15_000 });
  await page.goto("/cart");
}

async function applyCode(page: Page, code: string) {
  // The guest cart renders nothing until its products arrive, so wait for the
  // box to exist in one of its two shapes before deciding which it is.
  const opener = page.getByRole("button", { name: /have a coupon code/i });
  const input = page.getByLabel("Coupon code");
  await expect(opener.or(input).first()).toBeVisible({ timeout: 20_000 });
  if (await opener.isVisible()) await opener.click();
  await input.fill(code);
  await page.getByRole("button", { name: /^apply$/i }).click();
}

test("the cart previews a valid code and explains an invalid one", async ({ page }) => {
  test.slow();
  const product = await getInStockProduct();
  test.skip(!product, "no in-stock, single-variant product in this database");

  const code = `E2EPCT${stamp()}`;
  const tooBig = `E2EMIN${stamp()}`;
  await createCoupon({ code, type: "percent", value: 10 });
  await createCoupon({ code: tooBig, type: "flat", value: 100, minOrderValue: 9_999_999 });
  try {
    await addToCartAndOpen(page, product!.slug);

    await applyCode(page, "NOSUCHCODE123");
    await expect(page.getByText(/isn't a valid coupon code/i)).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: /^clear$/i }).click();

    await applyCode(page, tooBig);
    await expect(page.getByText(/more to use/i)).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: /^clear$/i }).click();

    await applyCode(page, code.toLowerCase()); // codes are case-insensitive
    await expect(page.getByText(/applied — you save/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(`Coupon (${code})`)).toBeVisible();
  } finally {
    await deleteCoupon(code);
    await deleteCoupon(tooBig);
  }
});
