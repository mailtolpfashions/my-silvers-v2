import { test, expect } from "@playwright/test";
import { signInAs } from "./helpers/auth";
import {
  createTestProduct,
  deleteTestProduct,
  deleteOrdersForUser,
  insertOrderWithItem,
  getAddresses,
  getUserRow,
  queryOne,
} from "./helpers/db";
import { SMOKE } from "./helpers/target";

/**
 * A signed-in shopper's own pages: profile, address book, order history,
 * invoice, returns, and tracking an order without signing in.
 */

test.describe("account", () => {
  test("profile changes are saved", { tag: [SMOKE] }, async ({ page }) => {
    const user = await signInAs(page, "customer", "acct-profile");
    try {
      await page.goto("/account/profile");
      await page.locator("#name").fill("Meenakshi E2E");
      await page.locator("#phone").fill("9123456780");
      await page.getByRole("button", { name: "Save changes" }).click();
      await expect.poll(async () => (await getUserRow(user.id))?.name, { timeout: 15_000 }).toBe("Meenakshi E2E");
      expect((await getUserRow(user.id))?.phone).toContain("9123456780");
    } finally {
      await user.dispose();
    }
  });

  test("a profile phone that cannot be Indian is refused", async ({ page }) => {
    const user = await signInAs(page, "customer", "acct-badphone");
    try {
      await page.goto("/account/profile");
      await page.locator("#phone").fill("12345");
      await page.getByRole("button", { name: "Save changes" }).click();
      await page.waitForTimeout(2000);
      expect((await getUserRow(user.id))?.phone ?? "", "a 5-digit phone was saved").not.toContain("12345");
    } finally {
      await user.dispose();
    }
  });

  test("addresses: add, make default, edit, delete", async ({ page }) => {
    const user = await signInAs(page, "customer", "acct-addr");
    const fill = async (name: string, city: string) => {
      await page.locator("#fullName").fill(name);
      await page.locator("#addressPhone").fill("9876543210");
      await page.locator("#addressLine1").fill("4 Car Street");
      await page.locator("#city").fill(city);
      await page.locator("#state").selectOption("Tamil Nadu");
      await page.locator("#pincode").fill("606701");
    };
    try {
      await page.goto("/account/addresses");
      await page.getByRole("button", { name: "Add address" }).click();
      await fill("Amma Home", "Chengam");
      await page.getByRole("button", { name: "Save address" }).click();
      await expect(page.getByText("Amma Home")).toBeVisible({ timeout: 15_000 });

      await page.getByRole("button", { name: "Add address" }).click();
      await fill("Office", "Tiruvannamalai");
      await page.getByRole("button", { name: "Save address" }).click();
      await expect(page.locator("main").getByText("Office", { exact: true })).toBeVisible({ timeout: 15_000 });
      expect(await getAddresses(user.id)).toHaveLength(2);

      // Exactly one default, whichever was made default last.
      await page.getByRole("button", { name: "Make default" }).first().click();
      await expect.poll(async () => (await getAddresses(user.id)).filter((a) => a.isDefault).length).toBe(1);

      // Edit the first one's city.
      await page.getByRole("button", { name: "Edit" }).first().click();
      await page.locator("#city").fill("Polur");
      await page.getByRole("button", { name: "Update address" }).click();
      await expect.poll(async () => (await getAddresses(user.id)).map((a) => a.city)).toContain("Polur");

      // Delete both.
      for (let i = 0; i < 2; i++) {
        await page.getByRole("button", { name: "Delete" }).first().click();
        await page.waitForTimeout(1200);
      }
      await expect.poll(async () => (await getAddresses(user.id)).length, { timeout: 15_000 }).toBe(0);
    } finally {
      await user.dispose();
    }
  });

  test("order history lists an order, and its invoice opens", async ({ page }) => {
    const p = await createTestProduct({ stock: 0, price: 2100 });
    const user = await signInAs(page, "customer", "acct-orders");
    const order = await insertOrderWithItem({
      userId: user.id, productId: p.id, name: p.name, price: 2100, orderStatus: "delivered", deliveredDaysAgo: 1,
    });
    try {
      await page.goto("/account/orders");
      await expect(page.locator("main")).toContainText(order.orderNumber);
      await page.goto(`/account/orders/${order.id}`);
      await expect(page.locator("main")).toContainText(p.name);
      await expect(page.locator("main")).toContainText("2,100");

      const res = await page.goto(`/account/orders/${order.id}/invoice`);
      expect(res?.status()).toBe(200);
      await expect(page.locator("body")).toContainText(order.orderNumber);
      await expect(page.locator("body")).toContainText(/GSTIN|Tax Invoice|Invoice/i);
    } finally {
      await deleteOrdersForUser(user.id).catch(() => {});
      await user.dispose();
      await deleteTestProduct(p.id);
    }
  });

  test("someone else's order is not visible to me", async ({ page, browser }) => {
    const p = await createTestProduct({ stock: 0 });
    const ctx = await browser.newContext();
    const owner = await signInAs(await ctx.newPage(), "customer", "acct-victim");
    await ctx.close();
    const order = await insertOrderWithItem({ userId: owner.id, productId: p.id, name: p.name, price: 500 });
    const me = await signInAs(page, "customer", "acct-snoop");
    try {
      await page.goto(`/account/orders/${order.id}`);
      await expect(page.locator("main")).not.toContainText(p.name);
      const inv = await page.goto(`/account/orders/${order.id}/invoice`);
      expect(inv?.status()).toBeLessThan(500);
      await expect(page.locator("body")).not.toContainText(order.orderNumber);
    } finally {
      await me.dispose();
      await deleteOrdersForUser(owner.id).catch(() => {});
      await owner.dispose();
      await deleteTestProduct(p.id);
    }
  });

  test("a return can't be requested once the window has closed", async ({ page }) => {
    const p = await createTestProduct({ stock: 0 });
    const user = await signInAs(page, "customer", "acct-late-return");
    const order = await insertOrderWithItem({
      userId: user.id, productId: p.id, name: p.name, price: 700, orderStatus: "delivered", deliveredDaysAgo: 60,
    });
    try {
      await page.goto(`/account/orders/${order.id}`);
      await expect(page.locator("main")).toContainText(p.name);
      await expect(page.getByRole("button", { name: "Request return" }), "the return button outlived the window").toHaveCount(0);
    } finally {
      await deleteOrdersForUser(user.id).catch(() => {});
      await user.dispose();
      await deleteTestProduct(p.id);
    }
  });
});

test.describe("track order (no sign-in)", () => {
  test("the right number + mobile finds an account order and asks to sign in", async ({ page, browser }) => {
    const p = await createTestProduct({ stock: 0 });
    const ctx = await browser.newContext();
    const owner = await signInAs(await ctx.newPage(), "customer", "track");
    await ctx.close();
    const order = await insertOrderWithItem({ userId: owner.id, productId: p.id, name: p.name, price: 500, phone: "9445566778" });
    try {
      await page.goto("/track-order");
      await page.locator("#orderNumber").fill(order.orderNumber);
      await page.locator("#contact").fill("9445566778");
      await page.getByRole("button", { name: "Track order" }).click();
      await expect(page.locator("main").getByRole("link", { name: "Sign in" })).toBeVisible({ timeout: 15_000 });
    } finally {
      await deleteOrdersForUser(owner.id).catch(() => {});
      await owner.dispose();
      await deleteTestProduct(p.id);
    }
  });

  test("a wrong mobile gets the same answer as a wrong number — no hint either exists", async ({ page, browser }) => {
    const p = await createTestProduct({ stock: 0 });
    const ctx = await browser.newContext();
    const owner = await signInAs(await ctx.newPage(), "customer", "track-wrong");
    await ctx.close();
    const order = await insertOrderWithItem({ userId: owner.id, productId: p.id, name: p.name, price: 500, phone: "9445566778" });
    try {
      await page.goto("/track-order");
      await page.locator("#orderNumber").fill(order.orderNumber);
      await page.locator("#contact").fill("9000000001");
      await page.getByRole("button", { name: "Track order" }).click();
      const wrongContact = page.getByText(/couldn't find an order with those details/i);
      await expect(wrongContact).toBeVisible({ timeout: 15_000 });

      await page.locator("#orderNumber").fill("MYS-987654321");
      await page.locator("#contact").fill("9445566778");
      await page.getByRole("button", { name: "Track order" }).click();
      await expect(wrongContact).toBeVisible({ timeout: 15_000 });
    } finally {
      await deleteOrdersForUser(owner.id).catch(() => {});
      await owner.dispose();
      await deleteTestProduct(p.id);
    }
  });
});

test.describe("newsletter", () => {
  test("signing up from the footer saves the address once", async ({ page }) => {
    const email = `e2e-news-${Date.now()}@example.test`;
    try {
      await page.goto("/");
      const box = page.getByLabel("Email address for newsletter");
      await box.scrollIntoViewIfNeeded();
      await box.fill(email);
      await box.press("Enter");
      await expect
        .poll(async () => queryOne(`SELECT 1 FROM "NewsletterSubscriber" WHERE "email" = $1`, [email]), { timeout: 15_000 })
        .not.toBeNull();

      // Again — must not error or duplicate.
      await page.reload();
      await page.getByLabel("Email address for newsletter").fill(email);
      await page.getByLabel("Email address for newsletter").press("Enter");
      await page.waitForTimeout(2000);
      const n = await queryOne<{ n: number }>(`SELECT count(*)::int n FROM "NewsletterSubscriber" WHERE "email" = $1`, [email]);
      expect(n?.n, "the same email was subscribed twice").toBe(1);
    } finally {
      await queryOne(`DELETE FROM "NewsletterSubscriber" WHERE "email" = $1 RETURNING 1`, [email]).catch(() => {});
    }
  });
});
