import { test, expect } from "@playwright/test";
import { signInAs, TEST_PASSWORD, E2E_EMAIL_PREFIX } from "./helpers/auth";
import {
  createTestUser,
  deleteOrdersForUser,
  deleteUser,
  getProductVendor,
  getTwoActiveProducts,
  insertPaidOrder,
  setProductVendor,
} from "./helpers/db";

/**
 * Product vendor: an internal field that must stay internal, keep one
 * spelling per supplier, and credit sales to the supplier recorded at sale.
 *
 * The snapshot taken at checkout is asserted in commerce.spec.ts, on the one
 * test that places a real order. These cover the rest: the form, the spelling
 * rule, the filter, the storefront, and the report.
 */

// Unique per run, so parallel or repeated runs never see each other's rows.
const STAMP = `${Date.now()}`;

test.describe("product vendor", () => {
  test("a typed vendor reuses the existing spelling, filters the list, and never reaches the storefront", async ({
    page,
  }) => {
    const pair = await getTwoActiveProducts();
    test.skip(pair.length < 2, "needs two active products");
    const [a, b] = pair;
    const vendor = `E2E Vendor ${STAMP}`;

    const previousA = await setProductVendor(a.slug, vendor);
    const previousB = await getProductVendor(b.slug);
    const admin = await signInAs(page, "admin", "vendor");

    try {
      // Different case and stray whitespace — the two ways one supplier
      // becomes two rows of a report.
      await page.goto(`/admin/products/${b.id}`);
      await page.locator("#vendor").fill(`  e2e   VENDOR ${STAMP} `);
      await page.getByRole("button", { name: /save changes/i }).click();
      await page.waitForURL(/\/admin\/products(\?|$)/, { timeout: 20_000 });

      expect(
        await getProductVendor(b.slug),
        "the typed vendor did not adopt the existing spelling"
      ).toBe(vendor);

      // Both products, and only those, under that vendor.
      await page.goto(`/admin/products?vendor=${encodeURIComponent(vendor)}`);
      await expect(page.getByText(/^2 products$/)).toBeVisible();
      await expect(page.getByRole("link", { name: a.name, exact: true })).toBeVisible();
      await expect(page.getByRole("link", { name: b.name, exact: true })).toBeVisible();

      // Internal means absent from what a shopper's browser receives — the
      // HTML and the flight payload together, which is the whole response.
      const html = await (await page.request.get(`/products/${a.slug}`)).text();
      expect(html, "the vendor name was sent to the storefront").not.toContain(vendor);
      expect(html, "a vendor field was sent to the storefront").not.toMatch(/"vendor"\s*:/);
    } finally {
      await setProductVendor(a.slug, previousA).catch(() => {});
      await setProductVendor(b.slug, previousB).catch(() => {});
      await admin.dispose();
    }
  });

  test("the finance report credits sales to the vendor recorded at sale", async ({ page }) => {
    const [product] = await getTwoActiveProducts();
    test.skip(!product, "needs an active product");
    const vendor = `E2E Report Vendor ${STAMP}`;

    const buyer = await createTestUser({
      email: `${E2E_EMAIL_PREFIX}vendor-buyer-${STAMP}@example.test`,
      password: TEST_PASSWORD,
      role: "customer",
    });
    // 3 × ₹1,000 at a cost of ₹400 each: revenue 3,000, cost 1,200, profit 1,800.
    await insertPaidOrder({
      userId: buyer.id,
      productId: product.id,
      name: product.name,
      price: 1000,
      costPrice: 400,
      quantity: 3,
      vendor,
    });
    const admin = await signInAs(page, "admin", "vendor-report");

    try {
      await page.goto("/admin/finance");
      const section = page.locator("#vendor-sales");
      await expect(section.getByRole("heading", { name: /sales by vendor/i })).toBeVisible();

      // The first table only: the "Top products" table below names the vendor
      // too, in its own column.
      const row = section.locator("table").first().locator("tr", { hasText: vendor });
      await expect(row, "the vendor has no row in the report").toHaveCount(1);
      const cells = row.locator("td");
      await expect(cells.nth(1), "units sold").toHaveText("3");
      await expect(cells.nth(2), "revenue").toContainText("3,000");
      await expect(cells.nth(3), "cost").toContainText("1,200");
      await expect(cells.nth(4), "profit").toContainText("1,800");

      // The vendor's own breakdown.
      await row.getByRole("link", { name: vendor }).click();
      await expect(page).toHaveURL(/[?&]v=/);
      await expect(
        section.getByRole("heading", { name: `Products from ${vendor}` })
      ).toBeVisible();
      const productRow = section.locator("tr", { hasText: product.name }).last();
      await expect(productRow.locator("td").nth(1), "the product's units").toHaveText("3");
    } finally {
      await deleteOrdersForUser(buyer.id).catch(() => {});
      await deleteUser(buyer.id).catch(() => {});
      await admin.dispose();
    }
  });
});
