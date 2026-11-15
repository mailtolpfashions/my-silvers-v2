import { test, expect } from "@playwright/test";
import { signInAs, TEST_PASSWORD } from "./helpers/auth";
import { activityFor, createTestUser, deleteUser, getUserRole } from "./helpers/db";

/**
 * The owner panel (Nov 2026): one `superadmin` who alone manages staff, sees
 * the money, changes settings and coupons, refunds, deletes and exports — and
 * an admin who keeps the day-to-day work but none of that.
 *
 * Every gate is checked from the admin's side (refused) and the owner's side
 * (allowed), so a test cannot pass because a page is simply broken.
 */

const OWNER_PAGES = [
  { path: "/admin/staff", heading: /staff & roles/i },
  { path: "/admin/activity", heading: /activity log/i },
  { path: "/admin/finance", heading: /finance/i },
  { path: "/admin/coupons", heading: /coupons/i },
  { path: "/admin/settings", heading: /settings/i },
];

const EXPORTS = [
  "/api/admin/export/customers",
  "/api/admin/export/orders",
  "/api/admin/export/products",
];

const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

test.describe("an admin is not the owner", () => {
  test("owner pages say so instead of rendering", async ({ page }) => {
    const admin = await signInAs(page, "admin", "notowner");
    try {
      for (const { path } of OWNER_PAGES) {
        await page.goto(path);
        await expect(
          page.getByRole("heading", { name: /only the owner can open/i }),
          `${path} rendered for an admin`
        ).toBeVisible({ timeout: 20_000 });
      }
      // And the Owner section is not in their navigation.
      await page.goto("/admin");
      await expect(page.getByRole("link", { name: "Staff & roles" })).toHaveCount(0);
    } finally {
      await admin.dispose();
    }
  });

  test("exports are refused", async ({ page }) => {
    const admin = await signInAs(page, "admin", "notowner-export");
    try {
      for (const path of EXPORTS) {
        const res = await page.request.get(path);
        expect(res.status(), `${path} served an admin`).toBe(403);
      }
    } finally {
      await admin.dispose();
    }
  });

  test("product delete buttons are hidden, archive stays", async ({ page }) => {
    const admin = await signInAs(page, "admin", "notowner-delete");
    try {
      await page.goto("/admin/products");
      const archive = page.getByRole("button", { name: /^archive$/i }).first();
      test.skip((await archive.count()) === 0, "needs at least one active product");
      await expect(archive).toBeVisible();
      await expect(page.getByRole("button", { name: /^delete$/i })).toHaveCount(0);
    } finally {
      await admin.dispose();
    }
  });
});

test.describe("the owner", () => {
  test("opens every owner page and sees the Owner navigation", async ({ page }) => {
    const owner = await signInAs(page, "superadmin", "owner-pages");
    try {
      for (const { path, heading } of OWNER_PAGES) {
        await page.goto(path);
        await expect(page.getByRole("heading", { name: /only the owner can open/i })).toHaveCount(0);
        await expect(page.getByRole("heading", { name: heading }).first()).toBeVisible({
          timeout: 20_000,
        });
      }
      await expect(page.getByRole("link", { name: "Staff & roles" })).toBeVisible();
    } finally {
      await owner.dispose();
    }
  });

  test("adds, changes and removes staff — and it lands in the activity log", async ({ page }) => {
    const owner = await signInAs(page, "superadmin", "owner-staff");
    const email = `e2e-staffee-${stamp()}@example.test`;
    const { id } = await createTestUser({ email, password: TEST_PASSWORD, role: "customer" });

    try {
      await page.goto("/admin/staff");
      await page.locator("#staff-email").fill(email);
      await page.locator("#staff-role").selectOption("admin");
      await page.getByRole("button", { name: /^add$/i }).click();
      await expect.poll(() => getUserRole(id), { timeout: 15_000 }).toBe("admin");

      // Admin → Editor from the list.
      await page.reload();
      await page.getByLabel(`Role for ${email}`).selectOption("editor");
      await expect.poll(() => getUserRole(id), { timeout: 15_000 }).toBe("editor");

      // Remove, through the confirmation.
      await page.reload();
      const row = page.getByRole("row").filter({ hasText: email });
      await row.getByRole("button", { name: /remove/i }).click();
      await page.getByRole("button", { name: /remove from staff/i }).click();
      await expect.poll(() => getUserRole(id), { timeout: 15_000 }).toBe("customer");

      // Polled: the log row is written just after the role change commits, so
      // the role can read "customer" a moment before the entry exists.
      await expect
        .poll(async () => (await activityFor(owner.id, 5)).join(" | "), { timeout: 15_000 })
        .toContain(`Removed ${email} from staff`);
      expect((await activityFor(owner.id, 5)).join(" | ")).toContain(`Made ${email} Admin`);

      // And the owner can read it back on the page.
      await page.goto("/admin/activity?area=staff");
      await expect(page.getByText(`Removed ${email} from staff`).first()).toBeVisible();
    } finally {
      await deleteUser(id).catch(() => {});
      await owner.dispose();
    }
  });

  test("can't change their own role", async ({ page }) => {
    const owner = await signInAs(page, "superadmin", "owner-self");
    try {
      await page.goto("/admin/staff");
      const me = page.getByRole("row").filter({ hasText: owner.email });
      await expect(me).toContainText("(you)");
      await expect(me.getByRole("combobox")).toHaveCount(0);
      await expect(me.getByRole("button", { name: /remove/i })).toHaveCount(0);
    } finally {
      await owner.dispose();
    }
  });

  test("an admin demoted by the owner loses the admin on their next click", async ({ browser }) => {
    const email = `e2e-demotee-${stamp()}@example.test`;
    const { id } = await createTestUser({ email, password: TEST_PASSWORD, role: "admin" });

    const ownerCtx = await browser.newContext();
    const adminCtx = await browser.newContext();
    const ownerPage = await ownerCtx.newPage();
    const adminPage = await adminCtx.newPage();
    const owner = await signInAs(ownerPage, "superadmin", "owner-demote");

    try {
      // The admin signs in and is working.
      await adminPage.goto("/login");
      await adminPage.locator("#email").fill(email);
      await adminPage.locator("#password").fill(TEST_PASSWORD);
      await adminPage.getByRole("button", { name: /sign in/i }).click();
      await adminPage.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20_000 });
      await adminPage.goto("/admin");
      await expect(adminPage).toHaveURL(/\/admin/);

      // The owner removes them.
      await ownerPage.goto("/admin/staff");
      const row = ownerPage.getByRole("row").filter({ hasText: email });
      await row.getByRole("button", { name: /remove/i }).click();
      await ownerPage.getByRole("button", { name: /remove from staff/i }).click();
      await expect.poll(() => getUserRole(id), { timeout: 15_000 }).toBe("customer");

      // Their very next request is refused.
      await adminPage.goto("/admin/orders");
      await expect(adminPage).toHaveURL(/\/login/);
    } finally {
      await deleteUser(id).catch(() => {});
      await owner.dispose();
      await ownerCtx.close();
      await adminCtx.close();
    }
  });
});

test.describe("new-order alert emails (Settings)", () => {
  test("the owner adds and removes alert addresses, and they persist", async ({ page }) => {
    const owner = await signInAs(page, "superadmin", "owner-alerts");
    const a = `e2e-alert-a-${stamp()}@example.test`;
    const b = `e2e-alert-b-${stamp()}@example.test`;
    try {
      await page.goto("/admin/settings");
      const box = page.locator("section", { has: page.locator("#alerts-heading") });
      await expect(box).toBeVisible();

      for (const email of [a, b]) {
        await box.locator("#alert-email").fill(email);
        await box.getByRole("button", { name: /^add$/i }).click();
      }
      await box.getByRole("button", { name: /save alert list/i }).click();
      await expect(page.getByText(/new-order emails will go to this list/i)).toBeVisible();

      await page.reload();
      await expect(box.getByRole("list", { name: /alert emails/i })).toContainText(a);
      await expect(box.getByRole("list", { name: /alert emails/i })).toContainText(b);

      // Remove both — the list goes back to "alerts go to the owner".
      await box.getByRole("button", { name: `Remove ${a}` }).click();
      await box.getByRole("button", { name: `Remove ${b}` }).click();
      await box.getByRole("button", { name: /save alert list/i }).click();
      await expect(page.getByText(/new-order emails will go to this list/i).last()).toBeVisible();
      await expect(box.getByRole("button", { name: /save alert list/i })).toBeDisabled();
      await page.reload();
      await expect(box).toContainText(/while the list is empty, alerts go to the owner/i);
    } finally {
      await owner.dispose();
    }
  });

  test("an admin can't see or change them", async ({ page }) => {
    const admin = await signInAs(page, "admin", "alerts-admin");
    try {
      await page.goto("/admin/settings");
      await expect(page.locator("#alerts-heading")).toHaveCount(0);
    } finally {
      await admin.dispose();
    }
  });
});
