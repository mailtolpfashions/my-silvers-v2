import { test, expect } from "@playwright/test";
import { signInAs, TEST_PASSWORD } from "./helpers/auth";
import { createTestUser, deleteOrdersForUser, deleteUser, insertOrderInState } from "./helpers/db";

/**
 * The admin home (Nov 2026 redesign). Built because a paid order went
 * unnoticed: it was one line of "Recent orders". The To ship card, the live
 * endpoint and the new-order alert are what stop that happening again.
 */

const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

async function buyer() {
  const email = `e2e-dash-buyer-${stamp()}@example.test`;
  return createTestUser({ email, password: TEST_PASSWORD, role: "customer" });
}

test.describe("To ship", () => {
  test("lists a paid order and a COD order, not a shipped or unpaid one", async ({ page }) => {
    const admin = await signInAs(page, "admin", "dash-toship");
    const { id: buyerId } = await buyer();
    try {
      const paid = await insertOrderInState(buyerId, { paymentMethod: "razorpay", paymentStatus: "paid" });
      const cod = await insertOrderInState(buyerId, { paymentMethod: "cod", paymentStatus: "pending" });
      const shipped = await insertOrderInState(buyerId, {
        paymentMethod: "razorpay",
        paymentStatus: "paid",
        shipped: true,
      });
      const unpaid = await insertOrderInState(buyerId, { paymentMethod: "razorpay", paymentStatus: "pending" });

      await page.goto("/admin?tab=to-ship");
      const card = page.locator("section", { has: page.locator("#to-ship-heading") });
      await expect(card).toBeVisible();
      await expect(card.getByRole("heading")).toContainText(/to ship/i);

      // The full list (the To ship tab) — the card itself shows the oldest 8.
      const list = page.locator("#recent-orders");
      await expect(list).toContainText(paid.orderNumber);
      await expect(list).toContainText(cod.orderNumber);
      await expect(list).not.toContainText(shipped.orderNumber);
      await expect(list).not.toContainText(unpaid.orderNumber);

      // The unpaid one is under Unpaid instead.
      await page.goto("/admin?tab=unpaid");
      await expect(page.locator("#recent-orders")).toContainText(unpaid.orderNumber);
    } finally {
      await deleteOrdersForUser(buyerId);
      await deleteUser(buyerId).catch(() => {});
      await admin.dispose();
    }
  });
});

test.describe("ranges", () => {
  test("Today, 7 days and 30 days all render, for admin and owner", async ({ browser }) => {
    for (const role of ["admin", "superadmin"] as const) {
      // A fresh browser per role: a signed-in visitor is sent past /login now
      // (signed-in-login.spec.ts), so one page can't sign in twice.
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      const who = await signInAs(page, role, `dash-range-${role}`);
      try {
        for (const [q, label] of [
          ["", /today/i],
          ["?range=7d", /last 7 days/i],
          ["?range=30d", /last 30 days/i],
        ] as const) {
          await page.goto(`/admin${q}`);
          await expect(page.getByText(new RegExp(`Sales · ${label.source}`, "i")).first()).toBeVisible();
          await expect(page.getByRole("heading", { name: /sales by (hour|day)/i })).toBeVisible();
        }
      } finally {
        await who.dispose();
        await ctx.close();
      }
    }
  });
});

test.describe("live endpoint", () => {
  test("answers an admin with the to-ship count", async ({ page }) => {
    const admin = await signInAs(page, "admin", "dash-live");
    try {
      const res = await page.request.get("/api/admin/live");
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(typeof body.toShip).toBe("number");
    } finally {
      await admin.dispose();
    }
  });

  test("refuses customers and signed-out visitors", async ({ page, request }) => {
    expect((await request.get("/api/admin/live")).status()).toBe(403);
    const customer = await signInAs(page, "customer", "dash-live-cust");
    try {
      expect((await page.request.get("/api/admin/live")).status()).toBe(403);
    } finally {
      await customer.dispose();
    }
  });
});

test.describe("new-order alert", () => {
  test("a newly paid order pops up on an open admin page", async ({ page }) => {
    test.setTimeout(90_000);
    const admin = await signInAs(page, "admin", "dash-watch");
    const { id: buyerId } = await buyer();
    try {
      // Listen BEFORE navigating: the watcher's first (baseline) reading fires
      // as soon as the page mounts.
      const baseline = page.waitForResponse((r) => r.url().includes("/api/admin/live"), {
        timeout: 20_000,
      });
      await page.goto("/admin");
      await baseline;

      const order = await insertOrderInState(buyerId, { paymentMethod: "razorpay", paymentStatus: "paid" });

      await expect(page.getByText(`New order ${order.orderNumber}`)).toBeVisible({ timeout: 45_000 });
      await expect(page).toHaveTitle(/^\(\d+\)/);
    } finally {
      await deleteOrdersForUser(buyerId);
      await deleteUser(buyerId).catch(() => {});
      await admin.dispose();
    }
  });
});
