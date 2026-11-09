import { test, expect } from "@playwright/test";
import {
  createTestUser,
  deleteUser,
  deleteOrdersForUser,
  insertOrderForUser,
  setEmailVerified,
  setPassword,
} from "./helpers/db";
import { signIn, E2E_EMAIL_PREFIX, TEST_PASSWORD } from "./helpers/auth";

/**
 * Guest orders appear in an account only once its email is confirmed — see
 * src/server/auth/email-verification.ts.
 *
 * The attack this guards against: register someone else's email (sign-up does
 * not verify it), wait, and read every guest order they later place with that
 * address — their name, address, phone and purchases.
 *
 * Test users are created now, so they fall after the rule's grandfather date
 * and start unconfirmed — exactly a fresh sign-up.
 */
test.describe("guest orders and email confirmation", () => {
  test("an unconfirmed account sees its own orders but not guest orders", async ({ page }) => {
    const email = `${E2E_EMAIL_PREFIX}confirm-${Date.now()}@example.test`;
    const { id } = await createTestUser({ email, password: TEST_PASSWORD, role: "customer" });
    try {
      const signedInOrder = await insertOrderForUser(id, false);
      const guestOrder = await insertOrderForUser(id, true);

      await signIn(page, email);
      await page.goto("/account/orders");
      await expect(page.getByText(signedInOrder)).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText(guestOrder), "a guest order leaked to an unconfirmed account")
        .toHaveCount(0);

      // The banner explains why, and offers the link again.
      await page.goto("/account");
      await expect(page.getByRole("button", { name: /resend link/i })).toBeVisible();

      // Confirmed → the guest order appears.
      await setEmailVerified(id, true);
      await page.goto("/account/orders");
      await expect(page.getByText(guestOrder)).toBeVisible({ timeout: 15_000 });
      await page.goto("/account");
      await expect(page.getByRole("button", { name: /resend link/i })).toHaveCount(0);
    } finally {
      await deleteOrdersForUser(id).catch(() => {});
      await deleteUser(id).catch(() => {});
    }
  });

  test("a session signed in with an old password does not see guest orders", async ({ page }) => {
    // The squatter case: they stay signed in while the real owner resets the
    // password, which confirms the email. Their session predates the reset.
    const email = `${E2E_EMAIL_PREFIX}pwf-${Date.now()}@example.test`;
    const { id } = await createTestUser({ email, password: TEST_PASSWORD, role: "customer" });
    try {
      const guestOrder = await insertOrderForUser(id, true);
      await signIn(page, email);

      await setPassword(id, "the-real-owners-new-password");
      await setEmailVerified(id, true);

      await page.goto("/account/orders");
      await expect(page.getByRole("heading", { name: /your orders/i })).toBeVisible();
      await expect(page.getByText(guestOrder), "a stale session saw guest orders").toHaveCount(0);
    } finally {
      await deleteOrdersForUser(id).catch(() => {});
      await deleteUser(id).catch(() => {});
    }
  });
});
