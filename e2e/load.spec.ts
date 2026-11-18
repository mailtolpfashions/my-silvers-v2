import { test, expect, type Browser, type Page } from "@playwright/test";
import { signInAs } from "./helpers/auth";
import {
  createTestProduct,
  deleteTestProduct,
  deleteOrdersForUser,
  getStock,
  countOrdersForUser,
} from "./helpers/db";
import { pieceAddButton } from "./helpers/ui";

/**
 * Round 3 of the Nov 2026 QA pass: many shoppers checking out at once
 * (`npm run test:load`; never part of an ordinary run).
 *
 * N shoppers sign in, fill checkout, then all press Place order (COD) in the
 * same instant, on ONE piece with exactly N in stock — so it measures both
 * how long a checkout takes under contention and that N simultaneous stock
 * decrements land exactly (no lost update, nothing negative).
 *
 * Against the LOCAL production build and the dev database: a single server
 * process with a 5-connection pool, which is the worst case for one
 * serverless instance (production adds instances under load). Browsing load
 * was measured separately — scripts/loadtest.ts.
 */

const SHOPPERS = Number(process.env.E2E_LOAD_SHOPPERS ?? 10);

async function setCod(browser: Browser, on: boolean) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const admin = await signInAs(page, "superadmin", "load-admin");
  try {
    await page.goto("/admin/settings");
    const toggle = page.locator("#codEnabled");
    await expect(toggle).toBeVisible({ timeout: 20_000 });
    if (((await toggle.getAttribute("data-state")) === "checked") !== on) {
      await toggle.click();
      await page.getByRole("button", { name: "Save settings" }).click();
      await expect(page.getByText("Settings saved.").first()).toBeVisible({ timeout: 20_000 });
    }
  } finally {
    await admin.dispose();
    await ctx.close();
  }
}

async function readyToPlace(page: Page, slug: string) {
  await page.goto(`/products/${slug}`);
  await pieceAddButton(page)
    .click();
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: /added to cart/i }).first()).toBeVisible({ timeout: 60_000 });
  await page.goto("/checkout");
  await expect(page.locator("#fullName")).toBeVisible({ timeout: 60_000 });
  await page.locator("#fullName").fill("E2E Load Buyer");
  await page.locator("#phone").fill("8925014736");
  await page.locator("#addressLine1").fill("12 Test Street");
  await page.locator("#city").fill("Coimbatore");
  await page.locator("#state").selectOption("Tamil Nadu");
  await page.locator("#pincode").fill("641001");
  await page.locator('input[name="paymentMethod"][value="cod"]').check({ force: true });
}

const pct = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)];
};

test(`${SHOPPERS} shoppers press Place order at the same moment`, { tag: ["@load"] }, async ({ browser }) => {
  test.setTimeout(600_000);
  const product = await createTestProduct({ stock: SHOPPERS, price: 999 });
  await setCod(browser, true);
  const shoppers: Array<{ page: Page; id: string; dispose: () => Promise<void>; close: () => Promise<void> }> = [];
  try {
    for (let i = 0; i < SHOPPERS; i++) {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      const u = await signInAs(page, "customer", `load-${i}`);
      shoppers.push({ page, id: u.id, dispose: u.dispose, close: () => ctx.close() });
    }
    await Promise.all(shoppers.map((s) => readyToPlace(s.page, product.slug)));

    // Everyone at once.
    const times = await Promise.all(
      shoppers.map(async (s) => {
        const t0 = Date.now();
        await s.page.getByRole("button", { name: /place order/i }).locator("visible=true").first().click();
        const ok = await s.page
          .waitForURL(/\/orders\//, { timeout: 120_000 })
          .then(() => true, () => false);
        return { ok, ms: Date.now() - t0 };
      })
    );

    const ok = times.filter((t) => t.ok).map((t) => t.ms);
    const summary = `${ok.length}/${SHOPPERS} placed · p50 ${pct(ok, 50)}ms · p95 ${pct(ok, 95)}ms · slowest ${Math.max(...ok)}ms`;
    console.log(`[load] ${summary}`);
    test.info().annotations.push({ type: "simultaneous checkouts", description: summary });

    let orders = 0;
    for (const s of shoppers) orders += await countOrdersForUser(s.id);
    expect(ok.length, "some shoppers never reached their order page").toBe(SHOPPERS);
    expect(orders, "orders were lost or duplicated under load").toBe(SHOPPERS);
    expect(await getStock(product.id), "simultaneous stock updates were lost").toBe(0);
    expect(pct(ok, 95), "the slowest shoppers waited too long").toBeLessThan(15_000);
  } finally {
    for (const s of shoppers) {
      await deleteOrdersForUser(s.id).catch(() => {});
      await s.dispose().catch(() => {});
      await s.close().catch(() => {});
    }
    await deleteTestProduct(product.id).catch(() => {});
    await setCod(browser, false).catch(() => {});
  }
});
