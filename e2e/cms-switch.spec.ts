import { test, expect } from "@playwright/test";
import crypto from "node:crypto";
import { signInAs } from "./helpers/auth";
import { queryOne } from "./helpers/db";

/**
 * Reported by the owner, Nov 2026: in Studio, clicking Edit on "Contact us"
 * opened the Privacy policy. The editor kept the state of the entry opened
 * BEFORE — including which entry Save writes to — because moving from one
 * entry to another reuses the same mounted editor. Saving there would have
 * overwritten the other page's draft.
 */

async function makePage(title: string, slug: string) {
  const type = await queryOne<{ id: string }>(`SELECT "id" FROM "ContentType" WHERE "name" = 'page'`);
  const id = `e2e_${crypto.randomBytes(10).toString("hex")}`;
  await queryOne(
    `INSERT INTO "ContentEntry" ("id", "contentTypeId", "slug", "status", "data", "updatedAt")
     VALUES ($1, $2, $3, 'draft', $4::jsonb, NOW()) RETURNING 1`,
    [id, type!.id, slug, JSON.stringify({ title, slug, excerpt: "", content: `<p>Body of ${title}</p>` })]
  );
  return id;
}

test("switching between entries in Studio opens — and saves — the one clicked", async ({ page }) => {
  const stamp = Date.now().toString(36);
  const a = { title: `E2E Alpha ${stamp}`, slug: `e2e-alpha-${stamp}` };
  const b = { title: `E2E Bravo ${stamp}`, slug: `e2e-bravo-${stamp}` };
  const idA = await makePage(a.title, a.slug);
  const idB = await makePage(b.title, b.slug);
  const editor = await signInAs(page, "editor", "cms-switch");
  const titleBox = () =>
    page.getByText(/^\s*Title\s*\*?\s*$/).first().locator("xpath=ancestor::*[.//input][1]").locator("input").first();
  try {
    const body = () => page.locator(".ProseMirror, [contenteditable=true]").first();
    const open = async (title: string, id: string) => {
      await page.getByRole("row").filter({ hasText: title }).getByRole("link", { name: "Edit" }).click();
      await expect(page).toHaveURL(new RegExp(id));
    };
    const expectShowing = async (t: { title: string }, how: string) => {
      await expect(titleBox(), `${how}: the title belongs to another page`).toHaveValue(t.title, { timeout: 15_000 });
      await expect(body(), `${how}: the page content belongs to another page`).toContainText(`Body of ${t.title}`);
    };

    // 1. List → A → Back → B.
    await page.goto("/cms/content/page");
    await open(a.title, idA);
    await expectShowing(a, "start");
    await page.goBack();
    await open(b.title, idB);
    await expectShowing(b, "via Back");

    // 2. B → the Studio menu's link to this list → A.
    await page.locator("aside a[href='/cms/content/page'], nav a[href='/cms/content/page']").first().click();
    await expect(page).toHaveURL(/\/cms\/content\/page$/);
    await open(a.title, idA);
    await expectShowing(a, "via the menu");

    // 3. A → breadcrumb back to the list → B.
    await page.locator("a[href='/cms/content/page']").first().click();
    await expect(page).toHaveURL(/\/cms\/content\/page$/);
    await open(b.title, idB);
    await expectShowing(b, "via the breadcrumb");

    // And Save writes to B, never to A.
    await titleBox().fill(`${b.title} edited`);
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByText("Draft saved.")).toBeVisible({ timeout: 20_000 });
    const rows = await queryOne<{ a: string; b: string }>(
      `SELECT (SELECT "data"->>'title' FROM "ContentEntry" WHERE "id" = $1) a,
              (SELECT "data"->>'title' FROM "ContentEntry" WHERE "id" = $2) b`,
      [idA, idB]
    );
    expect(rows?.a, "saving on B's screen changed A").toBe(a.title);
    expect(rows?.b).toBe(`${b.title} edited`);
  } finally {
    await editor.dispose();
    for (const id of [idA, idB]) {
      await queryOne(`DELETE FROM "ContentEntryVersion" WHERE "entryId" = $1 RETURNING 1`, [id]).catch(() => {});
      await queryOne(`DELETE FROM "ContentEntry" WHERE "id" = $1 RETURNING 1`, [id]).catch(() => {});
    }
  }
});
