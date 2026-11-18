import { test, expect, type Page } from "@playwright/test";
import { signInAs } from "./helpers/auth";
import { queryOne } from "./helpers/db";
import { SMOKE } from "./helpers/target";

/**
 * Studio (the CMS): an editor writes a page, publishes it, the shop shows it,
 * and the guard rails around the homepage hold.
 *
 * Entries made here have a title starting "E2E" and slug `e2e-…`, and are
 * deleted in `finally` — and swept by global-teardown if a run crashes.
 */

/** The input under a field's visible label (CMS labels are not `for`-bound). */
const field = (page: Page, label: string) =>
  page
    // The visible label text ("Title *"). These labels are not bound to their
    // inputs, so the textbox has no accessible name to find it by — noted as
    // an accessibility gap in the QA report.
    .getByText(new RegExp(`^\\s*${label}\\s*\\*?\\s*$`))
    .first()
    .locator("xpath=ancestor::*[.//input or .//textarea][1]")
    .locator("input, textarea")
    .first();

async function deleteEntry(slug: string) {
  await queryOne(
    `DELETE FROM "ContentEntryVersion" WHERE "entryId" IN (SELECT "id" FROM "ContentEntry" WHERE "slug" = $1) RETURNING 1`,
    [slug]
  ).catch(() => {});
  await queryOne(`DELETE FROM "ContentEntry" WHERE "slug" = $1 RETURNING 1`, [slug]).catch(() => {});
}

test.describe("studio", () => {
  test("an editor can open Studio", { tag: [SMOKE] }, async ({ page }) => {
    const editor = await signInAs(page, "editor", "cms-open");
    try {
      const res = await page.goto("/cms");
      expect(res?.status()).toBe(200);
      await expect(page.locator("h1").first()).toBeVisible();
    } finally {
      await editor.dispose();
    }
  });

  test("an editor writes a page, publishes it, and the shop shows it", async ({ page }) => {
    // Sign-in, save, publish and a storefront poll: past 30s when the full
    // suite is loading the dev database at the same time.
    test.slow();
    const stamp = Date.now();
    const title = `E2E Care Notes ${stamp}`;
    const slug = `e2e-care-${stamp}`;
    const editor = await signInAs(page, "editor", "cms-page");
    try {
      await page.goto("/cms/content/page/new");
      await field(page, "Title").fill(title);
      const slugBox = field(page, "Slug");
      await slugBox.fill(slug);

      await page.getByRole("button", { name: "Save draft" }).click();
      await expect(page.getByText("Draft saved.")).toBeVisible({ timeout: 20_000 });

      // A draft is not on the shop yet.
      const draft = await page.request.get(`/p/${slug}`);
      expect(await draft.text(), "a draft leaked onto the shop").not.toContain(title);

      /**
       * Reload onto the saved entry before publishing.
       *
       * QA finding (Nov 2026), left for a decision: after the FIRST save of a
       * new entry the editor rewrites the URL with history.replaceState and
       * then router.refresh()es — but the router still believes it is on
       * /new. On a loaded server the Publish button then sat disabled and
       * then hidden for 90s+; on an idle one it recovers. A reload is what a
       * stuck editor would do, so the rest of the flow is still exercised.
       */
      await expect(page).toHaveURL(/\/cms\/content\/page\/(?!new)[^/]+$/, { timeout: 15_000 });
      await page.reload();
      await page.getByRole("button", { name: "Publish", exact: true }).click();
      await expect(page.getByText("Published!")).toBeVisible({ timeout: 20_000 });

      await expect
        .poll(async () => (await page.request.get(`/p/${slug}?t=${Date.now()}`)).text(), { timeout: 20_000 })
        .toContain(title);
    } finally {
      await editor.dispose();
      await deleteEntry(slug);
    }
  });

  test("an editor cannot unpublish or delete the homepage", async ({ page }) => {
    const editor = await signInAs(page, "editor", "cms-home");
    try {
      const home = await queryOne<{ id: string }>(
        `SELECT e."id" FROM "ContentEntry" e JOIN "ContentType" t ON t."id" = e."contentTypeId" WHERE t."name" = 'homepage' LIMIT 1`
      );
      test.skip(!home, "no homepage entry");
      await page.goto(`/cms/content/homepage/${home!.id}`);
      await expect(page.getByRole("button", { name: "Save draft" })).toBeVisible({ timeout: 20_000 });
      await expect(page.getByRole("button", { name: "Unpublish" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Delete", exact: true })).toHaveCount(0);
    } finally {
      await editor.dispose();
    }
  });

  test("an editor cannot reach the admin side", async ({ page }) => {
    const editor = await signInAs(page, "editor", "cms-noadmin");
    try {
      await page.goto("/admin/orders");
      await expect(page).not.toHaveURL(/\/admin\/orders/);
    } finally {
      await editor.dispose();
    }
  });

  test("a customer cannot open Studio or the preview", async ({ page }) => {
    const user = await signInAs(page, "customer", "cms-customer");
    try {
      await page.goto("/cms");
      await expect(page).not.toHaveURL(/\/cms(\/|$)/);
      await page.goto("/preview/homepage");
      await expect(page).not.toHaveURL(/\/preview\//);
    } finally {
      await user.dispose();
    }
  });
});
