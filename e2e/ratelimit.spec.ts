import { test, expect, type Page } from "@playwright/test";
import crypto from "node:crypto";
import { createTestProduct, deleteTestProduct, queryOne } from "./helpers/db";

/**
 * Do the rate limits actually stop a flood? (`npm run test:ratelimits`)
 *
 * Runs ONLY in rate-limit mode — its own server on :3101 with the limiter ON
 * against the dev Upstash (see playwright.config.ts). An ordinary run sets
 * RATE_LIMIT_FAIL_OPEN, so it can never prove any of this.
 *
 * Each test pretends to be a fresh visitor with a made-up private IP
 * (10.x.x.x) in x-forwarded-for — what Vercel sets in production — so no
 * test shares a bucket with another, with a previous run, or with a real
 * shopper. The limits themselves are the TIERS in src/server/rate-limit/limiter.ts.
 */

const RATE_LIMITED = /too many requests|too many attempts|try again (in|later)|wait a few minutes/i;
const fakeIp = () => `10.${crypto.randomInt(1, 255)}.${crypto.randomInt(1, 255)}.${crypto.randomInt(1, 255)}`;

async function asVisitor(page: Page) {
  await page.setExtraHTTPHeaders({ "x-forwarded-for": fakeIp() });
}

test.describe("rate limits hold", { tag: ["@ratelimit"] }, () => {
  test("sign-in: the 6th attempt from one IP in 15 minutes is refused (limit 5)", async ({ page }) => {
    await asVisitor(page);
    let refusedAt = 0;
    for (let i = 1; i <= 7; i++) {
      await page.goto("/login");
      // A different (nonexistent) email each time: this is the IP limit, not
      // the per-account lockout.
      await page.locator("#email").fill(`e2e-flood-${crypto.randomBytes(4).toString("hex")}@example.test`);
      await page.locator("#password").fill("wrong-password-1");
      await page.getByRole("button", { name: /sign in/i }).click();
      await page.waitForTimeout(1500);
      if (RATE_LIMITED.test(await page.locator("main").innerText())) {
        refusedAt = i;
        break;
      }
    }
    expect(refusedAt, "sign-in was never rate limited").toBeGreaterThan(0);
    expect(refusedAt, "sign-in was limited before the allowance ran out").toBeGreaterThanOrEqual(6);
  });

  test("sign-up: a bot cannot create accounts endlessly from one IP", async ({ page }) => {
    test.slow();
    await asVisitor(page);
    const made: string[] = [];
    let limited = false;
    try {
      for (let i = 0; i < 7; i++) {
        const email = `e2e-botsignup-${crypto.randomBytes(4).toString("hex")}@example.test`;
        await page.context().clearCookies();
        await page.goto("/register");
        await page.locator("#name").fill("Bot");
        await page.locator("#email").fill(email);
        await page.locator("#password").fill("abcd1234efgh");
        await page.getByRole("button", { name: /create account|sign up|register/i }).click();
        await page.waitForTimeout(2500);
        const row = await queryOne(`SELECT 1 FROM "User" WHERE "email" = $1`, [email]);
        if (row) made.push(email);
        if (RATE_LIMITED.test(await page.locator("body").innerText())) {
          limited = true;
          break;
        }
      }
      expect(limited, `7 sign-ups from one IP were never limited (${made.length} accounts created)`).toBe(true);
      expect(made.length).toBeLessThanOrEqual(5);
    } finally {
      for (const e of made) await queryOne(`DELETE FROM "User" WHERE "email" = $1 RETURNING 1`, [e]).catch(() => {});
    }
  });

  test("coupon guessing: the 31st code check in 10 minutes is refused (limit 30)", async ({ request }) => {
    const headers = { "x-forwarded-for": fakeIp(), "content-type": "application/json" };
    let first429 = 0;
    for (let i = 1; i <= 33; i++) {
      const res = await request.post("/api/coupons/quote", {
        headers,
        data: { code: `GUESS${i}${crypto.randomBytes(2).toString("hex")}`.toUpperCase(), subtotalPaise: 500000 },
      });
      if (res.status() === 429) {
        first429 = i;
        break;
      }
    }
    expect(first429, "coupon guessing was never rate limited").toBe(31);
  });

  test("newsletter: a bot cannot pour addresses in (limit 3 per 15 minutes)", async ({ page }) => {
    test.slow();
    await asVisitor(page);
    const emails: string[] = [];
    try {
      for (let i = 0; i < 5; i++) {
        // Fresh page each time: a successful sign-up swaps the box for a thank-you.
        await page.goto("/");
        const email = `e2e-newsflood-${crypto.randomBytes(4).toString("hex")}@example.test`;
        emails.push(email);
        const box = page.getByLabel("Email address for newsletter");
        await box.scrollIntoViewIfNeeded();
        await box.fill(email);
        await box.press("Enter");
        await page.waitForTimeout(1500);
      }
      const n = await queryOne<{ n: number }>(
        `SELECT count(*)::int n FROM "NewsletterSubscriber" WHERE "email" = ANY($1)`,
        [emails]
      );
      expect(n?.n, "more newsletter sign-ups got through than the limit").toBeLessThanOrEqual(3);
    } finally {
      await queryOne(`DELETE FROM "NewsletterSubscriber" WHERE "email" = ANY($1) RETURNING 1`, [emails]).catch(() => {});
    }
  });

  test("notify-me shares the newsletter limit: a bot cannot flood stock alerts", async ({ page }) => {
    await asVisitor(page);
    const p = await createTestProduct({ stock: 0 });
    try {
      for (let i = 0; i < 5; i++) {
        await page.goto(`/products/${p.slug}`);
        await page.getByRole("button", { name: /notify me/i }).locator("visible=true").first().click();
        await page
          .getByLabel("Email address for a back-in-stock alert")
          .fill(`e2e-alertflood-${crypto.randomBytes(4).toString("hex")}@example.test`);
        await page.getByRole("dialog").getByRole("button", { name: "Notify me" }).click();
        await page.waitForTimeout(1500);
      }
      const n = await queryOne<{ n: number }>(`SELECT count(*)::int n FROM "StockNotification" WHERE "productId" = $1`, [p.id]);
      expect(n?.n, "more stock alerts got through than the limit").toBeLessThanOrEqual(3);
    } finally {
      await deleteTestProduct(p.id);
    }
  });

  test("order tracking: guessing order numbers is cut off", async ({ page }) => {
    await asVisitor(page);
    let limited = false;
    for (let i = 0; i < 8; i++) {
      await page.goto("/track-order");
      // Same order number, different contacts — the per-order limit (5).
      await page.locator("#orderNumber").fill("MYS-000001");
      await page.locator("#contact").fill(`98765432${String(i).padStart(2, "0")}`);
      await page.getByRole("button", { name: "Track order" }).click();
      await page.waitForTimeout(1500);
      if (RATE_LIMITED.test(await page.locator("main").innerText())) {
        limited = true;
        break;
      }
    }
    expect(limited, "8 guesses at one order number were never limited").toBe(true);
  });
});
