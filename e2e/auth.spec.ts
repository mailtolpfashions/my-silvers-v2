import { test, expect, type Page } from "@playwright/test";
import { createTestUser, deleteUser, deleteTestUsersByPrefix } from "./helpers/db";
import { TEST_PASSWORD, E2E_EMAIL_PREFIX } from "./helpers/auth";

/**
 * Account creation and sign-in.
 *
 * The security-relevant behaviour here is mostly about what the shop refuses
 * to tell you: whether an email is registered, whether a password was close,
 * why a login failed. Each of those is an oracle an attacker can query, so the
 * assertions are as much about the absence of information as the presence of
 * it.
 *
 * Serial, because several tests deliberately fail logins in a row and the
 * lockout counter is per-account but the sign-in surface is shared.
 */

test.describe.configure({ mode: "serial" });

const newEmail = (tag: string) =>
  `${E2E_EMAIL_PREFIX}${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;

/**
 * A login attempt expected to FAIL, settled deterministically.
 *
 * Not `waitForLoadState("networkidle")` — Next streams, so the network rarely
 * goes idle and the wait times out mid-navigation, leaving page.url() blank.
 * A rejected login re-renders the form in place, so the form coming back
 * interactive is the reliable "the round trip finished" signal.
 */
async function attemptLogin(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);

  const submit = page.getByRole("button", { name: /sign in/i });
  await submit.click();

  await expect(submit).toBeEnabled({ timeout: 20_000 });
  await expect(page.locator("#email")).toBeVisible();
}

test.describe("registration", () => {
  test("creates an account and signs the new customer straight in", async ({ page }) => {
    const email = newEmail("register");

    await page.goto("/register");
    await page.locator("#name").fill("E2E New Customer");
    await page.locator("#email").fill(email);
    await page.locator("#password").fill(TEST_PASSWORD);
    await page.getByRole("button", { name: /create|register|sign up/i }).click();

    // registerAction signs in on success, so landing back on /register means
    // it did not.
    await expect(page).not.toHaveURL(/\/register/, { timeout: 20_000 });

    // The account is real: it can reach a page that requires a session.
    await page.goto("/account");
    await expect(page).toHaveURL(/\/account/);

    await deleteTestUsersByPrefix(`${E2E_EMAIL_PREFIX}register-`).catch(() => {});
  });

  test("refuses a password under eight characters", async ({ page }) => {
    const email = newEmail("shortpw");

    await page.goto("/register");
    await page.locator("#name").fill("E2E Short Password");
    await page.locator("#email").fill(email);
    await page.locator("#password").fill("short");
    await page.getByRole("button", { name: /create|register|sign up/i }).click();

    // The password field carries minLength={8}, so the browser refuses to
    // submit and registerAction's own length check (auth-actions.ts) never
    // runs. Asserting on the server's wording would therefore be asserting on
    // a branch this path cannot reach — what a user actually meets is the
    // native constraint, so that is what is checked.
    await expect(page, "a short password submitted anyway").toHaveURL(/\/register/);
    await expect(page.locator("#password")).toHaveJSProperty("validity.valid", false);

    // And no account was created behind it.
    await page.goto("/account");
    await expect(page, "a short-password signup created a session").toHaveURL(/\/login/);
  });

  test("refuses an email that already has an account", async ({ page }) => {
    const email = newEmail("dupe");
    const user = await createTestUser({ email, password: TEST_PASSWORD, role: "customer" });

    try {
      await page.goto("/register");
      await page.locator("#name").fill("E2E Duplicate");
      await page.locator("#email").fill(email);
      await page.locator("#password").fill(TEST_PASSWORD);
      await page.getByRole("button", { name: /create|register|sign up/i }).click();

      await expect(page.getByText(/already exists/i)).toBeVisible({ timeout: 15_000 });
    } finally {
      await deleteUser(user.id).catch(() => {});
    }
  });
});

test.describe("brute force lockout", () => {
  test("locks the account after five wrong passwords, and stays locked for the right one", async ({
    page,
  }) => {
    const email = newEmail("lockout");
    const user = await createTestUser({ email, password: TEST_PASSWORD, role: "customer" });

    try {
      // MAX_FAILED_ATTEMPTS is 5 (lockout.ts).
      for (let i = 0; i < 5; i++) {
        await attemptLogin(page, email, `wrong-password-attempt-${i}`);
        await expect(page, `attempt ${i + 1} unexpectedly signed in`).toHaveURL(/\/login/);
      }

      // The real test: the CORRECT password must now be refused too. A lockout
      // that only blocks wrong guesses stops nothing.
      await attemptLogin(page, email, TEST_PASSWORD);
      await expect(page, "a locked account signed in with the correct password").toHaveURL(
        /\/login/
      );

      const body = (await page.textContent("body"))?.toLowerCase() ?? "";
      expect(body).toMatch(/lock|too many|try again/);
    } finally {
      await deleteUser(user.id).catch(() => {});
    }
  });
});

test.describe("password reset does not leak who has an account", () => {
  test("says the same thing for a real address and an unknown one", async ({ page }) => {
    const email = newEmail("forgot");
    const user = await createTestUser({ email, password: TEST_PASSWORD, role: "customer" });

    try {
      // Waiting on the message rather than reading the body straight after the
      // click: the button goes to "Sending…" first, and reading then captures
      // the pending state instead of the answer.
      const reply = /if an account exists/i;

      await page.goto("/forgot-password");
      await page.locator("#email").fill(email);
      await page.getByRole("button", { name: /send|reset|continue/i }).click();
      await expect(
        page.getByText(reply),
        "no confirmation shown for an address that does exist"
      ).toBeVisible({ timeout: 20_000 });

      await page.goto("/forgot-password");
      await page.locator("#email").fill("nobody-has-this-address-12345@example.test");
      await page.getByRole("button", { name: /send|reset|continue/i }).click();
      // The same wording for an address with no account. A difference here —
      // in text, or in how long it takes — is a user-enumeration oracle.
      await expect(
        page.getByText(reply),
        "a different answer for an unknown address leaks who has an account"
      ).toBeVisible({ timeout: 20_000 });
    } finally {
      await deleteUser(user.id).catch(() => {});
    }
  });

  test("refuses an invented reset token", async ({ page }) => {
    // Tokens are stored as SHA-256 hashes, so a guess cannot match; this
    // asserts the failure is handled rather than thrown.
    await page.goto("/reset-password?token=not-a-real-token-000000");

    await page.locator("#password").fill("a-brand-new-Password-1234").catch(() => {});
    await page
      .getByRole("button", { name: /reset|save|update/i })
      .click()
      .catch(() => {});

    const body = (await page.textContent("body"))?.toLowerCase() ?? "";
    expect(body).toMatch(/invalid|expired|not valid|try again/);
  });
});
