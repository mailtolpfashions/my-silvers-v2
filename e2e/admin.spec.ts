import { test, expect } from "@playwright/test";
import { signInAs } from "./helpers/auth";

/**
 * The back office: every admin screen renders, the exports produce real CSV,
 * and the CMS is reachable by an editor without opening the admin side.
 *
 * Deliberately shallow on content and strict on reachability. Asserting that
 * the orders table contains a particular order would tie the suite to whatever
 * is in the database this week; asserting that all eleven screens render for an
 * admin and none of them render for anyone else is the part that keeps being
 * true, and the part that breaks when a route is moved out from under its
 * layout.
 */

const ADMIN_PAGES = [
  { path: "/admin", heading: /dashboard|admin/i },
  { path: "/admin/products", heading: /products/i },
  { path: "/admin/categories", heading: /categories/i },
  { path: "/admin/inventory", heading: /inventory/i },
  { path: "/admin/orders", heading: /orders/i },
  { path: "/admin/customers", heading: /customers/i },
  { path: "/admin/reviews", heading: /reviews/i },
  { path: "/admin/carts", heading: /carts/i },
  { path: "/admin/payments", heading: /payments/i },
  { path: "/admin/finance", heading: /finance/i },
  { path: "/admin/newsletter", heading: /newsletter/i },
  { path: "/admin/settings", heading: /settings/i },
];

test.describe("admin screens", () => {
  test("every admin page renders for an admin", async ({ page }) => {
    const admin = await signInAs(page, "admin", "adminpages");

    try {
      for (const { path, heading } of ADMIN_PAGES) {
        const response = await page.goto(path);
        expect(response?.status(), `${path} did not return 200`).toBeLessThan(400);
        await expect(page, `${path} bounced away`).toHaveURL(new RegExp(path.replace("/", "\\/")));

        // The dashboard shell is behind Suspense; wait for real content rather
        // than the skeleton.
        await expect(
          page.getByRole("heading", { name: heading }).first(),
          `${path} rendered no matching heading`
        ).toBeVisible({ timeout: 20_000 });
      }
    } finally {
      await admin.dispose();
    }
  });

  test("an admin page that throws is not how we find out", async ({ page }) => {
    const admin = await signInAs(page, "admin", "adminerrors");
    const failures: string[] = [];

    // A server component that throws renders the error boundary rather than a
    // non-200, so status codes alone would miss it.
    page.on("pageerror", (err) => failures.push(err.message));

    try {
      for (const { path } of ADMIN_PAGES) {
        await page.goto(path);
        const body = (await page.textContent("body"))?.toLowerCase() ?? "";
        expect(body, `${path} rendered an error boundary`).not.toMatch(
          /something went wrong|application error|internal server error/
        );
      }
      expect(failures, `uncaught client errors: ${failures.join("; ")}`).toHaveLength(0);
    } finally {
      await admin.dispose();
    }
  });
});

test.describe("CSV exports", () => {
  const EXPORTS = [
    { path: "/api/admin/export/customers", label: "customers" },
    { path: "/api/admin/export/orders", label: "orders" },
    { path: "/api/admin/export/products", label: "products" },
  ];

  test("return real CSV to an admin", async ({ page }) => {
    const admin = await signInAs(page, "admin", "exports");

    try {
      for (const { path, label } of EXPORTS) {
        const response = await page.request.get(path);
        expect(response.status(), `${label} export failed`).toBe(200);

        expect(
          response.headers()["content-type"],
          `${label} export is not served as CSV`
        ).toMatch(/text\/csv/);

        // A header row at minimum — an empty 200 would pass a status check
        // while handing the owner a blank file.
        const body = await response.text();
        expect(body.split("\n")[0], `${label} export has no header row`).toContain(",");
      }
    } finally {
      await admin.dispose();
    }
  });

  test("are refused to an editor", async ({ page }) => {
    const editor = await signInAs(page, "editor", "exports-editor");

    try {
      for (const { path, label } of EXPORTS) {
        const response = await page.request.get(path);
        expect(response.status(), `an editor downloaded the ${label} export`).toBe(403);
      }
    } finally {
      await editor.dispose();
    }
  });

  test("are refused to a signed-out visitor", async ({ request }) => {
    for (const { path, label } of EXPORTS) {
      const response = await request.get(path);
      expect(
        response.status(),
        `the ${label} export was served to an anonymous request`
      ).toBeGreaterThanOrEqual(400);
    }
  });
});

test.describe("CMS", () => {
  test("an editor can reach the studio and its media library", async ({ page }) => {
    const editor = await signInAs(page, "editor", "cms");

    try {
      await page.goto("/cms");
      await expect(page).toHaveURL(/\/cms/);
      await expect(page.getByRole("heading").first()).toBeVisible({ timeout: 20_000 });

      await page.goto("/cms/media");
      await expect(page).toHaveURL(/\/cms\/media/);
      await expect(page.getByRole("heading").first()).toBeVisible({ timeout: 20_000 });

      // The library grid is fed by this route, not by the page render.
      const media = await page.request.get("/api/cms/media");
      expect(media.status(), "the media listing was refused to an editor").toBe(200);
    } finally {
      await editor.dispose();
    }
  });

  test("the media listing and upload signer are closed to a customer", async ({ page }) => {
    const customer = await signInAs(page, "customer", "cms-customer");

    try {
      expect((await page.request.get("/api/cms/media")).status()).toBe(403);

      // Signing an upload is write access to the Cloudinary account.
      const signed = await page.request.post("/api/uploads/sign", {
        data: { folder: "mysilvers/products" },
      });
      expect(signed.status(), "a customer could sign a Cloudinary upload").toBe(403);
    } finally {
      await customer.dispose();
    }
  });

  test("the homepage preview resolver is closed to a customer", async ({ page }) => {
    const customer = await signInAs(page, "customer", "cms-preview");

    try {
      // Resolves UNPUBLISHED draft content — same gate as the studio itself.
      const response = await page.request.post("/api/cms/preview/homepage", { data: {} });
      expect(response.status(), "a customer resolved draft homepage content").toBe(403);
    } finally {
      await customer.dispose();
    }
  });
});
