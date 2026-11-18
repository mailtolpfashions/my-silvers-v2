import { test, expect } from "@playwright/test";
import { signIn, signInAs, TEST_PASSWORD } from "./helpers/auth";
import {
  createTestUser,
  deleteOrdersForUser,
  deleteUser,
  getOrderNote,
  getUserIdByEmail,
  getUserRow,
  insertOrderInState,
  orderExists,
} from "./helpers/db";

/**
 * Owner create / edit / delete (Nov 2026): customers, orders, staff logins,
 * newsletter. Every one is owner-only; the admin side is checked too.
 */
const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const newCustomer = async () => {
  const email = `e2e-crud-${stamp()}@example.test`;
  const { id } = await createTestUser({
    email,
    password: TEST_PASSWORD,
    role: "customer",
    name: "Crud Customer",
  });
  return { id, email };
};

test.describe("customers", () => {
  test("owner edits a customer's name", async ({ page }) => {
    const owner = await signInAs(page, "superadmin", "crud-edit");
    const c = await newCustomer();
    try {
      await page.goto(`/admin/customers/${c.id}`);
      await page.locator("#cust-name").fill("Renamed Customer");
      await page.getByRole("button", { name: /save profile/i }).click();
      await expect.poll(async () => (await getUserRow(c.id))?.name).toBe("Renamed Customer");
    } finally {
      await deleteUser(c.id).catch(() => {});
      await owner.dispose();
    }
  });

  test("a blocked customer can't sign in, and unblocking lets them back", async ({ page, browser }) => {
    const owner = await signInAs(page, "superadmin", "crud-block");
    const c = await newCustomer();
    try {
      await page.goto(`/admin/customers/${c.id}`);
      await page.getByRole("button", { name: /^block customer$/i }).click();
      await page.getByRole("button", { name: /^block$/i }).click();
      await expect.poll(async () => Boolean((await getUserRow(c.id))?.blockedAt)).toBe(true);

      const ctx = await browser.newContext();
      const shopper = await ctx.newPage();
      await shopper.goto("/login");
      await shopper.locator("#email").fill(c.email);
      await shopper.locator("#password").fill(TEST_PASSWORD);
      await shopper.getByRole("button", { name: /sign in/i }).click();
      await expect(shopper.getByText(/account has been closed/i)).toBeVisible();

      await page.reload();
      await page.getByRole("button", { name: /^unblock customer$/i }).click();
      await page.getByRole("button", { name: /^unblock$/i }).click();
      await expect.poll(async () => (await getUserRow(c.id))?.blockedAt ?? null).toBeNull();

      await signIn(shopper, c.email);
      await expect(shopper).not.toHaveURL(/\/login/);
      await ctx.close();
    } finally {
      await deleteUser(c.id).catch(() => {});
      await owner.dispose();
    }
  });

  test("deleting a customer with orders erases them but keeps the orders", async ({ page }) => {
    const owner = await signInAs(page, "superadmin", "crud-erase");
    const c = await newCustomer();
    const order = await insertOrderInState(c.id, { paymentMethod: "razorpay", paymentStatus: "paid" });
    try {
      await page.goto(`/admin/customers/${c.id}`);
      await page.getByRole("button", { name: /^delete customer$/i }).click();
      await page.getByRole("alertdialog").getByRole("textbox").fill("delete");
      await page.getByRole("alertdialog").getByRole("button", { name: /^delete customer$/i }).click();
      await expect(page).toHaveURL(/\/admin\/customers$/);

      const row = await getUserRow(c.id);
      expect(row?.email).toMatch(/@deleted\.invalid$/);
      expect(row?.phone).toBeNull();
      expect(await orderExists(order.id)).toBe(true);
    } finally {
      await deleteOrdersForUser(c.id);
      await deleteUser(c.id).catch(() => {});
      await owner.dispose();
    }
  });

  test("an admin sees the customer read-only", async ({ page }) => {
    const admin = await signInAs(page, "admin", "crud-admin");
    const c = await newCustomer();
    try {
      await page.goto(`/admin/customers/${c.id}`);
      await expect(page.getByText("Crud Customer").first()).toBeVisible();
      await expect(
        page.getByRole("button", { name: /block customer|delete customer|save profile/i })
      ).toHaveCount(0);
    } finally {
      await deleteUser(c.id).catch(() => {});
      await admin.dispose();
    }
  });
});

test.describe("orders", () => {
  test("owner deletes an unpaid order but not a paid one; notes save", async ({ page }) => {
    const owner = await signInAs(page, "superadmin", "crud-order");
    const c = await newCustomer();
    const unpaid = await insertOrderInState(c.id, { paymentMethod: "razorpay", paymentStatus: "pending" });
    const paid = await insertOrderInState(c.id, { paymentMethod: "razorpay", paymentStatus: "paid" });
    try {
      await page.goto(`/admin/orders/${paid.id}`);
      await expect(page.getByText(/financial records and can.t be deleted/i)).toBeVisible();
      await page.locator("#order-note").fill("Deliver after 5 pm");
      await page.getByRole("button", { name: /save note/i }).click();
      await expect.poll(() => getOrderNote(paid.id)).toBe("Deliver after 5 pm");

      await page.goto(`/admin/orders/${unpaid.id}`);
      await page.getByRole("button", { name: /delete this order/i }).click();
      await page.getByRole("alertdialog").getByRole("textbox").fill("delete");
      await page.getByRole("alertdialog").getByRole("button", { name: /^delete order$/i }).click();
      await expect(page).toHaveURL(/\/admin\/orders$/);
      expect(await orderExists(unpaid.id)).toBe(false);
      expect(await orderExists(paid.id)).toBe(true);
    } finally {
      await deleteOrdersForUser(c.id);
      await deleteUser(c.id).catch(() => {});
      await owner.dispose();
    }
  });
});

test.describe("staff and newsletter", () => {
  test("owner creates a staff login directly", async ({ page }) => {
    const owner = await signInAs(page, "superadmin", "crud-staff");
    const email = `e2e-newstaff-${stamp()}@example.test`;
    try {
      await page.goto("/admin/staff");
      // The form opens behind "Add staff" since the staff page redesign.
      await page.getByRole("button", { name: "Add staff" }).click();
      await page.getByRole("tab", { name: /create a new login/i }).click();
      await page.locator("#staff-name").fill("New Staff");
      await page.locator("#staff-email").fill(email);
      await page.getByRole("button", { name: /create and send invite/i }).click();
      await expect.poll(() => getUserIdByEmail(email), { timeout: 15_000 }).not.toBeNull();
      const id = (await getUserIdByEmail(email))!;
      expect((await getUserRow(id))?.role).toBe("admin");
    } finally {
      const id = await getUserIdByEmail(email);
      if (id) await deleteUser(id).catch(() => {});
      await owner.dispose();
    }
  });

  test("owner adds and removes a newsletter subscriber", async ({ page }) => {
    const owner = await signInAs(page, "superadmin", "crud-news");
    const email = `e2e-news-${stamp()}@example.test`;
    try {
      await page.goto("/admin/newsletter");
      await page.getByRole("textbox", { name: /email to subscribe/i }).fill(email);
      await page.getByRole("button", { name: /add subscriber/i }).click();
      const row = page.getByRole("row").filter({ hasText: email });
      await expect(row).toBeVisible();
      await row.getByRole("button", { name: /^remove$/i }).click();
      await page.getByRole("alertdialog").getByRole("button", { name: /^remove$/i }).click();
      await expect(page.getByRole("row").filter({ hasText: email })).toHaveCount(0);
    } finally {
      await owner.dispose();
    }
  });
});
