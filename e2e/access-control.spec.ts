import { test, expect } from "@playwright/test";

/**
 * Regression cover for the authorization findings in the Aug 2026 audit.
 *
 * F-06 — /preview rendered draft HTML from an unauthenticated route, outside
 * the proxy matcher entirely.
 * F-01 — role was read from the JWT, which is written once at sign-in and never
 * refreshed, so revoking an admin did nothing for up to 30 days. The signed-in
 * half of that fix is covered in role-revocation.spec.ts, which needs database
 * access; this file covers the unauthenticated boundary, which does not.
 */

const GATED = [
  { path: "/admin", label: "admin dashboard" },
  { path: "/admin/orders", label: "admin orders" },
  { path: "/admin/finance", label: "the finance books" },
  { path: "/admin/settings", label: "store settings" },
  { path: "/cms", label: "CMS home" },
  { path: "/cms/media", label: "the media library" },
  { path: "/preview/homepage", label: "the CMS preview target" },
  { path: "/account", label: "the account area" },
  { path: "/account/orders", label: "past orders" },
];

test.describe("unauthenticated access", () => {
  for (const { path, label } of GATED) {
    test(`redirects ${label} (${path}) to login`, async ({ page }) => {
      const response = await page.goto(path);

      // The redirect must land on /login, and must not have leaked any of the
      // gated content on the way — so assert the final URL, not just a status.
      await expect(page).toHaveURL(/\/login(\?|$)/);
      expect(response?.status()).toBeLessThan(400);

      // The proxy passes the original path so login can bounce back after auth.
      const redirectParam = new URL(page.url()).searchParams.get("redirect");
      expect(redirectParam).toBe(path);
    });
  }
});

test.describe("gated routes stay out of the index", () => {
  test("robots.txt disallows every private area", async ({ request }) => {
    const body = await (await request.get("/robots.txt")).text();

    for (const prefix of ["/admin", "/cms", "/account", "/checkout", "/cart", "/preview"]) {
      expect(body, `robots.txt should disallow ${prefix}`).toContain(`Disallow: ${prefix}`);
    }
  });

  test("sitemap.xml lists only public pages", async ({ request }) => {
    const body = await (await request.get("/sitemap.xml")).text();

    for (const prefix of ["/admin", "/cms", "/account", "/preview"]) {
      expect(body, `sitemap must not expose ${prefix}`).not.toContain(prefix);
    }
  });
});

test.describe("login", () => {
  test("rejects a wrong password without revealing whether the account exists", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.locator("#email").fill("definitely-not-a-user@example.com");
    await page.locator("#password").fill("wrong-password-here");
    await page.getByRole("button", { name: /sign in/i }).click();

    // Still on /login, still unauthenticated.
    await expect(page).toHaveURL(/\/login/);

    // The message must not distinguish "no such account" from "wrong password";
    // that difference is a user-enumeration oracle.
    const body = (await page.textContent("body"))?.toLowerCase() ?? "";
    expect(body).not.toContain("no account");
    expect(body).not.toContain("user not found");
    expect(body).not.toContain("does not exist");
  });
});
