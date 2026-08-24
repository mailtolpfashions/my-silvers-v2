import { test, expect, type Page } from "@playwright/test";
import { createTestUser, setUserRole, deleteUser } from "./helpers/db";

/**
 * Regression cover for F-01 (audit, Aug 2026) — the most important test here.
 *
 * `auth.config.ts` writes `token.role` once, at sign-in, and nothing refreshes
 * it. Before the fix, every gate read that frozen copy, so demoting or firing
 * an admin left them with full access — orders, refunds, the finance books —
 * until their token expired, which defaulted to 30 days.
 *
 * The fix routes every decision through `getCurrentRole()`, which re-reads the
 * database. This test is what proves it: sign in as an admin, take the role
 * away underneath the live session, and assert the very next request is
 * refused. If someone reverts to `session.user.role`, this goes red.
 *
 * It writes to the database directly, so it needs DATABASE_URL to point at the
 * same database the server under test is using — otherwise the demotion lands
 * somewhere the app cannot see and the test passes for the wrong reason.
 */

const PASSWORD = "e2e-revocation-Test-1234";
const EMAIL_PREFIX = "e2e-revoke-";

const newEmail = () =>
  `${EMAIL_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  // #email / #password rather than getByLabel: the footer newsletter form also
  // exposes an "Email" label, which makes the accessible-name lookup ambiguous.
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();

  // Sign-in is a Server Action, so the click resolves before the session
  // cookie is set and the redirect lands. Navigating immediately would race it
  // and read as "not signed in".
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20_000 });
}

// Serial: these share the sign-in surface and the `auth` rate-limit tier,
// which is 5 attempts per 15 minutes.
test.describe.configure({ mode: "serial" });

test.describe("role revocation takes effect immediately", () => {
  test("a demoted admin loses /admin on their next request", async ({ page }) => {
    const email = newEmail();
    const user = await createTestUser({ email, password: PASSWORD, role: "admin" });

    try {
      await signIn(page, email);

      // Baseline: the admin area is reachable while the role stands. Without
      // this the test could pass simply because sign-in silently failed.
      await page.goto("/admin");
      await expect(page, "the seeded admin could not reach /admin to begin with").toHaveURL(
        /\/admin/
      );

      // Revoke underneath the live session. The browser's JWT still says
      // "admin" at this point — that is the whole premise of the finding.
      await setUserRole(user.id, "customer");

      // The very next request must be refused, with no grace period.
      await page.goto("/admin");
      await expect(page, "a demoted admin still reached /admin").toHaveURL(/\/login/);

      // And the sensitive sub-pages, not just the dashboard root.
      await page.goto("/admin/finance");
      await expect(page, "a demoted admin still reached the finance books").toHaveURL(/\/login/);
    } finally {
      await deleteUser(user.id).catch(() => {});
    }
  });

  test("a demoted editor loses /cms on their next request", async ({ page }) => {
    const email = newEmail();
    const user = await createTestUser({ email, password: PASSWORD, role: "editor" });

    try {
      await signIn(page, email);

      await page.goto("/cms");
      await expect(page, "the seeded editor could not reach /cms to begin with").toHaveURL(/\/cms/);

      await setUserRole(user.id, "customer");

      await page.goto("/cms");
      await expect(page, "a demoted editor still reached the CMS").toHaveURL(/\/login/);
    } finally {
      await deleteUser(user.id).catch(() => {});
    }
  });

  test("a deleted account cannot keep using its session", async ({ page }) => {
    const email = newEmail();
    const user = await createTestUser({ email, password: PASSWORD, role: "admin" });

    await signIn(page, email);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin/);

    // getCurrentRole() returns null when the row is gone, which must read as
    // "no role" rather than throwing or defaulting to something permissive.
    await deleteUser(user.id);

    await page.goto("/admin");
    await expect(page, "a deleted admin still reached /admin").toHaveURL(/\/login/);
  });

  /**
   * The endpoints that hand over DATA rather than a page.
   *
   * The first pass at fixing F-01 covered the page gates and requireRole(), and
   * missed these: the CSV exports, the Cloudinary signer and the CMS routes all
   * read `session.user.role` directly, so a revoked admin could still pull the
   * entire customer list — names, emails, phone numbers — for as long as their
   * session lasted. Bulk exfiltration outlasting revocation is worse than page
   * access outlasting it, so it gets its own test.
   */
  test("a demoted admin cannot pull the CSV exports", async ({ page }) => {
    const email = newEmail();
    const user = await createTestUser({ email, password: PASSWORD, role: "admin" });

    const EXPORTS = [
      "/api/admin/export/customers",
      "/api/admin/export/orders",
      "/api/admin/export/products",
    ];

    try {
      await signIn(page, email);

      // Baseline: they work while the role stands, so a 403 afterwards means
      // revocation and not a broken route.
      for (const path of EXPORTS) {
        const ok = await page.request.get(path);
        expect(ok.status(), `${path} was not reachable by a real admin`).toBe(200);
      }

      await setUserRole(user.id, "customer");

      for (const path of EXPORTS) {
        const denied = await page.request.get(path);
        expect(denied.status(), `${path} still served a demoted admin`).toBe(403);
      }

      // The Cloudinary signer too — a signature is an upload to your account.
      const signed = await page.request.post("/api/uploads/sign", {
        data: { folder: "mysilvers/products" },
      });
      expect(signed.status(), "a demoted admin could still sign uploads").toBe(403);
    } finally {
      await deleteUser(user.id).catch(() => {});
    }
  });

  test("an editor cannot reach the admin area at all", async ({ page }) => {
    const email = newEmail();
    const user = await createTestUser({ email, password: PASSWORD, role: "editor" });

    try {
      await signIn(page, email);

      // Role separation, not revocation: an editor is a legitimate CMS user and
      // must still be refused the orders, refunds and finance pages.
      await page.goto("/admin");
      await expect(page, "an editor reached the admin dashboard").toHaveURL(/\/login/);

      await page.goto("/admin/finance");
      await expect(page, "an editor reached the finance books").toHaveURL(/\/login/);
    } finally {
      await deleteUser(user.id).catch(() => {});
    }
  });
});
