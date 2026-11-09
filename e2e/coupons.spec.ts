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
  const opener = page.getByRole("button", { name: /have a (coupon|different) code/i });
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

test("listed coupons appear as offers; a private one does not", async ({ page }) => {
  test.slow();
  const product = await getInStockProduct();
  test.skip(!product, "no in-stock, single-variant product in this database");

  const listed = `E2EOFFER${stamp()}`;
  const locked = `E2ELOCK${stamp()}`;
  const hidden = `E2EPRIV${stamp()}`;
  await createCoupon({ code: listed, type: "flat", value: 50, showToShoppers: true });
  await createCoupon({
    code: locked,
    type: "percent",
    value: 20,
    minOrderValue: 9_999_999,
    showToShoppers: true,
  });
  await createCoupon({ code: hidden, type: "flat", value: 75, showToShoppers: false });
  try {
    await addToCartAndOpen(page, product!.slug);

    const offers = page.getByRole("region", { name: /available offers/i });
    await expect(offers.getByText(listed)).toBeVisible({ timeout: 20_000 });
    // A bigger cart would unlock it — shown, with the nudge, and no button.
    await expect(offers.getByText(locked)).toBeVisible();
    await expect(offers.getByText(/more to unlock/i)).toBeVisible();
    await expect(offers.getByRole("button", { name: `Apply ${locked}` })).toHaveCount(0);
    // Private codes are never listed.
    await expect(page.getByText(hidden)).toHaveCount(0);

    await offers.getByRole("button", { name: `Apply ${listed}` }).click();
    await expect(page.getByText(/applied — you save ₹50/i)).toBeVisible({ timeout: 15_000 });

    // A private code still works when typed.
    await page.getByRole("button", { name: `Remove coupon ${listed}` }).click();
    await applyCode(page, hidden);
    await expect(page.getByText(/applied — you save ₹75/i)).toBeVisible({ timeout: 15_000 });
  } finally {
    await deleteCoupon(listed);
    await deleteCoupon(locked);
    await deleteCoupon(hidden);
  }
});
