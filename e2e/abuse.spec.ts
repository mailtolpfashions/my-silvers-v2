import { test, expect, type Page } from "@playwright/test";
import crypto from "node:crypto";
import { signInAs, TEST_PASSWORD } from "./helpers/auth";
import {
  createTestUser,
  createTestProduct,
  deleteTestProduct,
  deleteOrdersForUser,
  deleteUser,
  insertOrderWithItem,
  getAddresses,
  getUserIdByEmail,
  queryOne,
} from "./helpers/db";

/**
 * Round 1 of the Nov 2026 QA pass: people who are NOT genuine shoppers.
 *
 *   - hostile text (script injection) typed into anything that staff later read
 *   - a bot posting straight past the browser's own checks
 *   - boundaries: just inside / just outside every limit
 *   - spam: the same thing submitted again and again
 *
 * A bot does not use our form; it posts whatever it likes. The closest a
 * browser test gets is stripping the form's own guards (maxlength, type=email,
 * minlength) before submitting — what reaches the server is then exactly
 * what a script would send. `unguard()` does that.
 */

/** Payloads that execute if any page renders user text as HTML. */
const XSS = `<img src=x onerror="window.__xss=1">"><script>window.__xss=1</script>`;

async function unguard(page: Page) {
  await page.evaluate(() => {
    for (const el of Array.from(document.querySelectorAll("input, textarea"))) {
      el.removeAttribute("maxlength");
      el.removeAttribute("minlength");
      el.removeAttribute("pattern");
      el.removeAttribute("required");
      if ((el as HTMLInputElement).type === "email") (el as HTMLInputElement).type = "text";
    }
    for (const f of Array.from(document.querySelectorAll("form"))) f.setAttribute("novalidate", "");
  });
}

/** Opens a page as `page` and reports whether any injected script ran. */
async function scriptRan(page: Page, path: string): Promise<boolean> {
  let dialog = false;
  page.on("dialog", (d) => {
    dialog = true;
    d.dismiss().catch(() => {});
  });
  await page.goto(path);
  await page.waitForLoadState("networkidle").catch(() => {});
  const flag = await page.evaluate(() => (window as unknown as { __xss?: number }).__xss);
  return dialog || flag === 1;
}

const uniq = () => `${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;

// ─── Hostile text, read by staff ────────────────────────────────────────────

test.describe("script injection never runs — on the shop or in the admin", () => {
  test("a customer named with a script: admin customer pages stay inert", async ({ browser }) => {
    const email = `e2e-xss-${uniq()}@example.test`;
    const { id } = await createTestUser({ email, password: TEST_PASSWORD, role: "customer", name: XSS });
    const ctx = await browser.newContext();
    const ownerPage = await ctx.newPage();
    const owner = await signInAs(ownerPage, "superadmin", "xss-owner");
    try {
      expect(await scriptRan(ownerPage, `/admin/customers?q=${encodeURIComponent(email)}`), "script ran on the customers list").toBe(false);
      expect(await scriptRan(ownerPage, `/admin/customers/${id}`), "script ran on the customer page").toBe(false);
      // And the text is shown as text, not swallowed.
      await expect(ownerPage.locator("main")).toContainText("onerror");
    } finally {
      await owner.dispose();
      await ctx.close();
      await deleteUser(id).catch(() => {});
    }
  });

  test("an order with a scripted name, address and note: admin order page and invoice stay inert", async ({ page, browser }) => {
    const p = await createTestProduct({ stock: 0, price: 999 });
    const { id: userId } = await createTestUser({ email: `e2e-xssord-${uniq()}@example.test`, password: TEST_PASSWORD, role: "customer" });
    const order = await insertOrderWithItem({ userId, productId: p.id, name: p.name, price: 999 });
    await queryOne(
      `UPDATE "Order" SET "shippingAddress" = jsonb_build_object('fullName', $2::text, 'phone', '9876543210',
         'addressLine1', $2::text, 'city', 'Chennai', 'state', 'Tamil Nadu', 'pincode', '600001'),
         "notes" = $2, "giftMessage" = $2 WHERE "id" = $1 RETURNING 1`,
      [order.id, XSS]
    );
    const owner = await signInAs(page, "superadmin", "xss-order-owner");
    try {
      expect(await scriptRan(page, `/admin/orders?q=${order.orderNumber}`), "script ran on the orders list").toBe(false);
      expect(await scriptRan(page, `/admin/orders/${order.id}`), "script ran on the order page").toBe(false);
      expect(await scriptRan(page, `/admin/orders/${order.id}/invoice`), "script ran on the invoice").toBe(false);
    } finally {
      await owner.dispose();
      await deleteOrdersForUser(userId).catch(() => {});
      await deleteUser(userId).catch(() => {});
      await deleteTestProduct(p.id);
      void browser;
    }
  });

  test("a scripted review: moderation queue and the product page stay inert", async ({ page }) => {
    const p = await createTestProduct({ stock: 2 });
    const { id: userId } = await createTestUser({ email: `e2e-xssrev-${uniq()}@example.test`, password: TEST_PASSWORD, role: "customer", name: XSS });
    await queryOne(
      `INSERT INTO "Review" ("id", "userId", "productId", "rating", "title", "comment", "status", "updatedAt")
       VALUES ($1, $2, $3, 5, $4, $4, 'approved', NOW()) RETURNING 1`,
      [`e2e_${crypto.randomBytes(10).toString("hex")}`, userId, p.id, XSS]
    ).catch(async () =>
      // Some schemas have no updatedAt on Review.
      queryOne(
        `INSERT INTO "Review" ("id", "userId", "productId", "rating", "title", "comment", "status")
         VALUES ($1, $2, $3, 5, $4, $4, 'approved') RETURNING 1`,
        [`e2e_${crypto.randomBytes(10).toString("hex")}`, userId, p.id, XSS]
      )
    );
    const owner = await signInAs(page, "superadmin", "xss-review-owner");
    try {
      expect(await scriptRan(page, `/products/${p.slug}`), "script ran on the product page").toBe(false);
      expect(await scriptRan(page, "/admin/reviews"), "script ran in the review queue").toBe(false);
    } finally {
      await owner.dispose();
      await deleteTestProduct(p.id); // takes its reviews with it
      await deleteUser(userId).catch(() => {});
    }
  });

  test("a spreadsheet formula in a customer name is defused in the CSV export", async ({ page }) => {
    const email = `e2e-csv-${uniq()}@example.test`;
    const evil = `=HYPERLINK("http://evil.example","Click")`;
    const { id } = await createTestUser({ email, password: TEST_PASSWORD, role: "customer", name: evil });
    const owner = await signInAs(page, "superadmin", "csv-owner");
    try {
      const res = await page.request.get("/api/admin/export/customers");
      expect(res.status()).toBe(200);
      const csv = await res.text();
      const line = csv.split(/\r?\n/).find((l) => l.includes(email));
      expect(line, "test customer missing from the export").toBeTruthy();
      expect(line!, "a formula reached the CSV un-defused").not.toMatch(/(^|,)"?=HYPERLINK/);
    } finally {
      await owner.dispose();
      await deleteUser(id).catch(() => {});
    }
  });
});

// ─── A bot at the sign-up form ──────────────────────────────────────────────

test.describe("sign-up: what a bot can and cannot get past", () => {
  async function register(page: Page, name: string, email: string, password: string) {
    await page.goto("/register");
    await unguard(page);
    await page.locator("#name").fill(name);
    await page.locator("#email").fill(email);
    await page.locator("#password").fill(password);
    await page.getByRole("button", { name: /create account|sign up|register/i }).click();
    await page.waitForTimeout(2500);
  }

  test("a 7-character password is refused; 8 is the boundary and accepted", async ({ page }) => {
    const e7 = `e2e-pw7-${uniq()}@example.test`;
    const e8 = `e2e-pw8-${uniq()}@example.test`;
    await register(page, "Seven", e7, "abc1234");
    expect(await getUserIdByEmail(e7), "a 7-character password made an account").toBeNull();
    await page.context().clearCookies();
    await register(page, "Eight", e8, "abcd1234");
    expect(await getUserIdByEmail(e8), "an 8-character password was refused").not.toBeNull();
    const id = await getUserIdByEmail(e8);
    if (id) await deleteUser(id);
  });

  test("an address that is not an email is refused by the server", async ({ page }) => {
    const bogus = `e2e-not-an-email-${uniq()}`;
    await register(page, "Bot", bogus, "abcd1234efgh");
    const id = await getUserIdByEmail(bogus);
    if (id) await deleteUser(id);
    expect(id, "the server stored an account for a non-email").toBeNull();
  });

  test("a 5,000-character name is refused by the server", async ({ page }) => {
    const email = `e2e-longname-${uniq()}@example.test`;
    await register(page, "N".repeat(5000), email, "abcd1234efgh");
    const id = await getUserIdByEmail(email);
    const row = id ? await queryOne<{ n: number }>(`SELECT length("name") n FROM "User" WHERE "id" = $1`, [id]) : null;
    if (id) await deleteUser(id);
    expect(row?.n ?? 0, "a 5,000-character name was stored").toBeLessThanOrEqual(200);
  });

  test("the same email in different case/spacing is one account, not two", async ({ page }) => {
    const base = `e2e-dupe-${uniq()}@example.test`;
    const { id } = await createTestUser({ email: base, password: TEST_PASSWORD, role: "customer" });
    try {
      await register(page, "Dupe", `  ${base.toUpperCase()}  `, "abcd1234efgh");
      const n = await queryOne<{ n: number }>(`SELECT count(*)::int n FROM "User" WHERE lower("email") = $1`, [base]);
      expect(n?.n, "a case variant made a second account").toBe(1);
    } finally {
      await deleteUser(id).catch(() => {});
    }
  });

  test("a throwaway (disposable) email is refused", async ({ page }) => {
    const email = `e2e-${uniq()}@mailinator.com`;
    await register(page, "Throwaway", email, "abcd1234efgh");
    const id = await getUserIdByEmail(email);
    if (id) await deleteUser(id);
    expect(id, "a mailinator address made an account").toBeNull();
  });
});

// ─── Address book boundaries ────────────────────────────────────────────────

test.describe("address book boundaries", () => {
  async function addAddress(page: Page, o: { name: string; phone: string; pincode: string }) {
    await page.goto("/account/addresses");
    const add = page.getByRole("button", { name: "Add address" });
    if (!(await add.isEnabled())) return false;
    await add.click();
    await unguard(page);
    await page.locator("#fullName").fill(o.name);
    await page.locator("#addressPhone").fill(o.phone);
    await page.locator("#addressLine1").fill("4 Car Street, Big Bazaar");
    await page.locator("#city").fill("Chengam");
    await page.locator("#state").selectOption("Tamil Nadu");
    await page.locator("#pincode").fill(o.pincode);
    await page.getByRole("button", { name: "Save address" }).click();
    await page.waitForTimeout(2000);
    return true;
  }

  test("PIN codes: 000000, 5 digits and 7 digits are refused; a real one is kept", async ({ page }) => {
    const user = await signInAs(page, "customer", "pin-bounds");
    try {
      for (const bad of ["000000", "60670", "6067011", "abcdef"]) {
        await addAddress(page, { name: `Bad ${bad}`, phone: "9876543210", pincode: bad });
      }
      expect(await getAddresses(user.id), "an invalid PIN was saved").toHaveLength(0);
      await addAddress(page, { name: "Good PIN", phone: "9876543210", pincode: "606701" });
      expect(await getAddresses(user.id)).toHaveLength(1);
    } finally {
      await user.dispose();
    }
  });

  test("mobile formats a real person types are all accepted and stored the same way", async ({ page }) => {
    const user = await signInAs(page, "customer", "phone-forms");
    try {
      for (const [i, phone] of ["+91 98765 43210", "098765-43210", "(987) 654 3210"].entries()) {
        await addAddress(page, { name: `Form ${i}`, phone, pincode: "606701" });
      }
      const rows = await queryOne<{ phones: string[] }>(
        `SELECT array_agg(DISTINCT "phone") phones FROM "Address" WHERE "userId" = $1`,
        [user.id]
      );
      expect(rows?.phones, "the same number was stored in different shapes").toEqual(["9876543210"]);
    } finally {
      await user.dispose();
    }
  });

  test("a sixth address is refused (limit is five)", async ({ page }) => {
    test.slow(); // five full saves, each a server round trip
    const user = await signInAs(page, "customer", "addr-limit");
    try {
      for (let i = 0; i < 5; i++) await addAddress(page, { name: `Home ${i}`, phone: "9876543210", pincode: "606701" });
      expect(await getAddresses(user.id)).toHaveLength(5);
      await page.goto("/account/addresses");
      await expect(page.getByRole("button", { name: "Add address" })).toBeDisabled();
    } finally {
      await user.dispose();
    }
  });

  test("Tamil and emoji in a name are kept exactly", async ({ page }) => {
    const user = await signInAs(page, "customer", "unicode");
    const name = "மீனாட்சி சுந்தரம் 💍";
    try {
      await addAddress(page, { name, phone: "9876543210", pincode: "606701" });
      const rows = await getAddresses(user.id);
      expect(rows.map((r) => r.fullName)).toContain(name);
      await page.goto("/account/addresses");
      await expect(page.locator("main")).toContainText(name);
    } finally {
      await user.dispose();
    }
  });
});

// ─── Spam ───────────────────────────────────────────────────────────────────

test.describe("repeat submissions do not pile up", () => {
  test("notify-me: the same email ten times is one alert", async ({ page }) => {
    const p = await createTestProduct({ stock: 0 });
    const email = `e2e-spam-${uniq()}@example.test`;
    try {
      for (let i = 0; i < 4; i++) {
        await page.goto(`/products/${p.slug}`);
        await page.getByRole("button", { name: /notify me/i }).locator("visible=true").first().click();
        await page.getByLabel("Email address for a back-in-stock alert").fill(i % 2 ? email.toUpperCase() : email);
        await page.getByRole("dialog").getByRole("button", { name: "Notify me" }).click();
        await page.waitForTimeout(1200);
      }
      const n = await queryOne<{ n: number }>(
        `SELECT count(*)::int n FROM "StockNotification" WHERE "productId" = $1 AND lower("email") = lower($2)`,
        [p.id, email]
      );
      expect(n?.n, "repeat sign-ups stored more than one alert").toBe(1);
    } finally {
      await deleteTestProduct(p.id);
    }
  });

  test("a customer cannot review a piece they never bought", async ({ page }) => {
    const p = await createTestProduct({ stock: 2 });
    const user = await signInAs(page, "customer", "fake-review");
    try {
      await page.goto(`/products/${p.slug}`);
      await expect(page.getByRole("button", { name: /write a review/i })).toHaveCount(0);
    } finally {
      await user.dispose();
      await deleteTestProduct(p.id);
    }
  });
});

// ─── Someone else's things ──────────────────────────────────────────────────

test.describe("guessing ids", () => {
  test("another customer's order page by id gives nothing away", async ({ page }) => {
    const p = await createTestProduct({ stock: 0 });
    const { id: victim } = await createTestUser({ email: `e2e-victim-${uniq()}@example.test`, password: TEST_PASSWORD, role: "customer" });
    const order = await insertOrderWithItem({ userId: victim, productId: p.id, name: p.name, price: 500 });
    try {
      // Anonymous, with the right id but no token.
      await page.goto(`/orders/${order.id}`);
      await expect(page.locator("body")).not.toContainText(p.name);
      // With a guessed token.
      await page.goto(`/orders/${order.id}?ot=${"0".repeat(48)}`);
      await expect(page.locator("body")).not.toContainText(p.name);
    } finally {
      await deleteOrdersForUser(victim).catch(() => {});
      await deleteUser(victim).catch(() => {});
      await deleteTestProduct(p.id);
    }
  });

  test("a signed-out visitor cannot reach an account page by URL", async ({ page }) => {
    for (const path of ["/account/profile", "/account/addresses", "/account/orders", "/wishlist"]) {
      await page.goto(path);
      const url = page.url();
      expect(url, `${path} opened without signing in`).toMatch(/\/login|\/wishlist/);
      if (url.includes("/wishlist")) await expect(page.locator("main")).not.toContainText(/e2e/i);
    }
  });

  test("sign-in with someone else's email and a wrong password says nothing specific", async ({ page }) => {
    const email = `e2e-enum-${uniq()}@example.test`;
    const { id } = await createTestUser({ email, password: TEST_PASSWORD, role: "customer" });
    try {
      const msg = async (e: string) => {
        await page.goto("/login");
        await page.locator("#email").fill(e);
        await page.locator("#password").fill("definitely-wrong-1");
        await page.getByRole("button", { name: /sign in/i }).click();
        await page.waitForTimeout(2000);
        return (await page.locator("main").innerText()).replace(/\s+/g, " ");
      };
      const real = await msg(email);
      const fake = await msg(`e2e-nobody-${uniq()}@example.test`);
      // Lockout copy may differ after repeated tries; the first answer must not.
      expect(real, "login tells a stranger whether an account exists").toBe(fake);
    } finally {
      await deleteUser(id).catch(() => {});
    }
  });
});

