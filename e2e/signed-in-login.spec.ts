import { test, expect } from "@playwright/test";
import { signInAs } from "./helpers/auth";

/**
 * A signed-in visitor should never be shown the sign-in form again.
 *
 * Reported Nov 2026: sign in on one tab, reload /login?redirect=/account on
 * another, and the form came back while the header beside it said "Admin".
 * The proxy now sends them on — but never towards a role-gated page, where the
 * cookie's frozen role could loop a demoted admin (see role-revocation.spec.ts).
 */
test.describe("signed-in visitors skip the sign-in form", () => {
  test("/login with a redirect goes to that page", async ({ page }) => {
    const user = await signInAs(page, "customer", "signedin-login");
    try {
      await page.goto("/login?redirect=/account");
      await expect(page).toHaveURL(/\/account$/);
    } finally {
      await user.dispose();
    }
  });

  test("/login and /register with no redirect go to the account", async ({ page }) => {
    const user = await signInAs(page, "customer", "signedin-login");
    try {
      await page.goto("/login");
      await expect(page).toHaveURL(/\/account$/);
      await page.goto("/register");
      await expect(page).toHaveURL(/\/account$/);
    } finally {
      await user.dispose();
    }
  });

  test("an off-site redirect is ignored", async ({ page }) => {
    const user = await signInAs(page, "customer", "signedin-login");
    try {
      await page.goto("/login?redirect=//evil.example");
      await expect(page).toHaveURL(/\/account$/);
    } finally {
      await user.dispose();
    }
  });

  test("a role-gated redirect still shows the form", async ({ page }) => {
    const user = await signInAs(page, "customer", "signedin-login");
    try {
      await page.goto("/login?redirect=/admin");
      await expect(page).toHaveURL(/\/login\?redirect=(%2F|\/)admin/);
      await expect(page.locator("#email")).toBeVisible();
    } finally {
      await user.dispose();
    }
  });
});
