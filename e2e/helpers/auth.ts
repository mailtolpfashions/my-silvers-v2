import type { Page } from "@playwright/test";
import { createTestUser, deleteUser, type TestRole } from "./db";

export const TEST_PASSWORD = "e2e-suite-Password-1234";

/**
 * Signs in through the real login form.
 *
 * `#email` / `#password` rather than getByLabel: the footer newsletter form
 * also exposes an "Email" label, which makes the accessible-name lookup
 * ambiguous and fails on strict mode.
 */
export async function signIn(page: Page, email: string, password = TEST_PASSWORD): Promise<void> {
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();

  // Sign-in is a Server Action: the click resolves before the session cookie is
  // written and the redirect lands, so navigating immediately would race it.
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20_000 });
}

export const E2E_EMAIL_PREFIX = "e2e-";

function newEmail(tag: string): string {
  return `${E2E_EMAIL_PREFIX}${tag}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}@example.test`;
}

/**
 * A throwaway account, signed in and ready, with a disposer.
 *
 * Returned rather than fixture-scoped because several suites need the user id
 * afterwards — to change the role underneath a live session, or to assert what
 * landed in the database.
 */
export async function signInAs(
  page: Page,
  role: TestRole,
  // Annotated rather than inferred from the default: `tag = role` would type it
  // as TestRole, and the tag is a free-form label used to tell one suite's
  // throwaway accounts from another's in the database.
  tag: string = role
): Promise<{ id: string; email: string; dispose: () => Promise<void> }> {
  const email = newEmail(tag);
  const { id } = await createTestUser({ email, password: TEST_PASSWORD, role });
  await signIn(page, email);

  return {
    id,
    email,
    dispose: async () => {
      await deleteUser(id).catch(() => {});
    },
  };
}
