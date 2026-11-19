import fs from "node:fs";
import { test, expect, type Page } from "@playwright/test";
import { signInAs } from "./helpers/auth";
import { createTestProduct, deleteTestProduct, deleteOrdersForUser, insertOrderWithItem } from "./helpers/db";

/**
 * A printed invoice is the invoice — nothing else on the sheet.
 *
 * Reported Nov 2026: printing from the admin put the admin's top bar
 * ("Admin > Orders > Edit > Invoice" and the signed-in name) across the top
 * of a customer's tax invoice. Checked in PRINT media, which is what the
 * printer and "Save as PDF" render.
 */

/** Text that is actually visible when the page is rendered for print. */
async function printedText(page: Page): Promise<string> {
  await page.emulateMedia({ media: "print" });
  return page.evaluate(() => {
    const out: string[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const el = walker.currentNode.parentElement;
      if (!el) continue;
      const cs = getComputedStyle(el);
      const box = el.getBoundingClientRect();
      if (cs.visibility === "hidden" || cs.display === "none" || box.width === 0 || box.height === 0) continue;
      const t = walker.currentNode.textContent?.trim();
      if (t) out.push(t);
    }
    return out.join(" ");
  });
}

/**
 * In print media nothing but the invoice (and the containers holding it) may
 * be laid out. Hidden-but-present chrome still takes space — the old
 * storefront copy printed as 2 pages / 7 MB — and a full-screen fixed layer
 * can be drawn OVER the invoice by some mobile browsers, which is the likely
 * cause of a tester's "blank PDF" (Nov 2026).
 */
async function expectNoTrailingSpace(page: Page) {
  const laidOut = await page.evaluate(() => {
    const inv = document.querySelector("[data-invoice]")!;
    return [...document.body.querySelectorAll("*")]
      .filter((e) => !inv.contains(e) && !e.contains(inv) && getComputedStyle(e).display !== "none")
      .map((e) => `${e.tagName.toLowerCase()}.${(e.getAttribute("class") ?? "").split(" ")[0]}`)
      .slice(0, 8);
  });
  expect(laidOut, "something besides the invoice is laid out on the printed page").toEqual([]);
}

test.describe("printing an invoice", () => {
  test("from the admin: no admin menu, breadcrumbs or staff name on the page", async ({ page, browser }) => {
    const p = await createTestProduct({ stock: 0, price: 999 });
    const ctx = await browser.newContext();
    const customer = await signInAs(await ctx.newPage(), "customer", "print-cust");
    await ctx.close();
    const order = await insertOrderWithItem({ userId: customer.id, productId: p.id, name: p.name, price: 999 });
    const owner = await signInAs(page, "superadmin", "print-owner");
    try {
      await page.goto(`/admin/orders/${order.id}/invoice`);
      await expect(page.locator("[data-invoice]")).toBeVisible({ timeout: 20_000 });
      const text = await printedText(page);
      await page.screenshot({ path: test.info().outputPath("admin-invoice-print.png"), fullPage: true });
      await expectNoTrailingSpace(page);

      expect(text).toContain("TAX INVOICE");
      expect(text).toContain(order.orderNumber);
      for (const chrome of ["Admin", "Orders", "Edit", "Print", "Dashboard"]) {
        expect(text, `"${chrome}" from the admin screen is printed on the invoice`).not.toMatch(new RegExp(`\\b${chrome}\\b`));
      }
    } finally {
      await owner.dispose();
      await deleteOrdersForUser(customer.id).catch(() => {});
      await customer.dispose();
      await deleteTestProduct(p.id);
    }
  });

  test("from the customer's account: no shop header, menu or footer on the page", async ({ page }) => {
    const p = await createTestProduct({ stock: 0, price: 1499 });
    const customer = await signInAs(page, "customer", "print-own");
    const order = await insertOrderWithItem({ userId: customer.id, productId: p.id, name: p.name, price: 1499 });
    try {
      await page.goto(`/account/orders/${order.id}/invoice`);
      await expect(page.locator("[data-invoice]")).toBeVisible({ timeout: 20_000 });
      const text = await printedText(page);
      await page.screenshot({ path: test.info().outputPath("customer-invoice-print.png"), fullPage: true });
      await expectNoTrailingSpace(page);

      expect(text).toContain(order.orderNumber);
      for (const chrome of ["Jewellery", "Collections", "Track order", "Newsletter", "Subscribe", "SUBSCRIBE", "Print"]) {
        expect(text, `"${chrome}" from the shop is printed on the invoice`).not.toContain(chrome);
      }
    } finally {
      await deleteOrdersForUser(customer.id).catch(() => {});
      await customer.dispose();
      await deleteTestProduct(p.id);
    }
  });
});

test.describe("downloading an invoice", () => {
  /**
   * Nov 2026: testers got a blank-looking PDF on a phone and a 0 KB file on a
   * desktop from the browser's print window. Download PDF builds the file
   * itself; these check it is a real, one-page PDF named after the order —
   * on desktop and (via the mobile project) on a phone.
   */
  test("Download PDF saves a real one-page PDF named after the order", async ({ page }) => {
    const p = await createTestProduct({ stock: 0, price: 1499 });
    const customer = await signInAs(page, "customer", "dl-own");
    const order = await insertOrderWithItem({ userId: customer.id, productId: p.id, name: p.name, price: 1499 });
    try {
      await page.goto(`/account/orders/${order.id}/invoice`);
      await expect(page.locator("[data-invoice]")).toBeVisible({ timeout: 20_000 });

      const [download] = await Promise.all([
        page.waitForEvent("download", { timeout: 60_000 }),
        page.getByRole("button", { name: "Download PDF" }).click(),
      ]);
      expect(download.suggestedFilename()).toBe(`${order.orderNumber}-invoice.pdf`);

      const file = test.info().outputPath(download.suggestedFilename());
      await download.saveAs(file);
      const bytes = fs.readFileSync(file);
      expect(bytes.subarray(0, 5).toString(), "not a PDF").toBe("%PDF-");
      expect(bytes.length, "the PDF is empty or near-empty (the '0 KB' report)").toBeGreaterThan(15_000);
      const pages = (bytes.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
      expect(pages, "an ordinary invoice should fit one page").toBe(1);
    } finally {
      await deleteOrdersForUser(customer.id).catch(() => {});
      await customer.dispose();
      await deleteTestProduct(p.id);
    }
  });

  test("while printing, the page title is the order number — so Save as PDF is named after it", async ({ page }) => {
    const p = await createTestProduct({ stock: 0, price: 999 });
    const customer = await signInAs(page, "customer", "dl-title");
    const order = await insertOrderWithItem({ userId: customer.id, productId: p.id, name: p.name, price: 999 });
    try {
      await page.goto(`/account/orders/${order.id}/invoice`);
      await expect(page.locator("[data-invoice]")).toBeVisible({ timeout: 20_000 });
      const before = await page.title();
      await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
      expect(await page.title()).toBe(`Invoice ${order.orderNumber}`);
      await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
      expect(await page.title()).toBe(before);
    } finally {
      await deleteOrdersForUser(customer.id).catch(() => {});
      await customer.dispose();
      await deleteTestProduct(p.id);
    }
  });
});
