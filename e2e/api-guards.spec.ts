import { test, expect, type APIRequestContext } from "@playwright/test";
import { signInAs } from "./helpers/auth";
import { CRON_TEST_SECRET } from "../playwright.config";
import { LIVE_SAFE, SMOKE } from "./helpers/target";

/**
 * Every API route that does something privileged, knocked on by someone who
 * should not get in. The UI hides these doors; this checks they are locked.
 *
 * "Refused" means a 4xx, or a redirect to sign in — never a 200 and never a
 * 500 (a crash on bad input is its own bug: it is the difference between a
 * locked door and a broken one).
 */

const REFUSED = [400, 401, 403, 404, 405, 302, 303, 307, 308];

async function expectRefused(request: APIRequestContext, method: "get" | "post", path: string, init: object = {}) {
  const res = await request[method](path, { maxRedirects: 0, ...init });
  expect(REFUSED, `${method.toUpperCase()} ${path} answered ${res.status()} to a stranger`).toContain(res.status());
}

test.describe("privileged APIs refuse an anonymous caller", () => {
  for (const path of [
    "/api/admin/export/customers",
    "/api/admin/export/orders",
    "/api/admin/export/products",
    "/api/admin/live",
    "/api/cms/media",
  ]) {
    test(`GET ${path}`, { tag: [LIVE_SAFE] }, async ({ request }) => {
      await expectRefused(request, "get", path);
    });
  }

  test("POST /api/uploads/sign", { tag: [LIVE_SAFE] }, async ({ request }) => {
    await expectRefused(request, "post", "/api/uploads/sign", { data: { folder: "reviews" } });
  });

  test("POST /api/cms/preview/homepage", { tag: [LIVE_SAFE] }, async ({ request }) => {
    await expectRefused(request, "post", "/api/cms/preview/homepage", { data: {} });
  });

  test("POST /api/admin/export/products (bulk import)", { tag: [LIVE_SAFE] }, async ({ request }) => {
    await expectRefused(request, "post", "/api/admin/export/products", { data: "sku,name\nX,Y" });
  });
});

test.describe("cron jobs only run for the scheduler", () => {
  for (const job of ["auto-refund-sweep", "payment-reminders", "usage-check"]) {
    test(`${job}: no secret, wrong secret`, { tag: [SMOKE, LIVE_SAFE] }, async ({ request }) => {
      const none = await request.get(`/api/cron/${job}`);
      expect(none.status(), `${job} ran with no secret`).toBe(401);
      const wrong = await request.get(`/api/cron/${job}`, { headers: { authorization: "Bearer guessed" } });
      expect(wrong.status(), `${job} ran with a guessed secret`).toBe(401);
    });
  }

  /**
   * The one job safe to actually RUN from a test: it only counts usage. The
   * refund sweep would call Razorpay with live keys; the reminder job emails.
   */
  test("usage-check runs with the right secret", async ({ request }) => {
    const res = await request.get("/api/cron/usage-check", {
      headers: { authorization: `Bearer ${CRON_TEST_SECRET}` },
    });
    expect(res.status(), "the scheduler's own call was refused").toBeLessThan(400);
  });
});

test.describe("webhooks refuse an unsigned caller", () => {
  for (const path of ["/api/webhooks/nimbuspost", "/api/webhooks/courier-updates", "/api/webhooks/shiprocket"]) {
    test(`POST ${path}`, { tag: [LIVE_SAFE] }, async ({ request }) => {
      const res = await request.post(path, {
        headers: { "content-type": "application/json" },
        data: JSON.stringify({ awb: "000000", current_status: "Delivered", status: "delivered" }),
      });
      expect(res.status(), `${path} believed an unsigned tracking update`).toBeGreaterThanOrEqual(400);
      expect(res.status()).toBeLessThan(500);
    });
  }
});

test.describe("signed in, but the wrong role", () => {
  test("a customer cannot read the live admin feed or exports", async ({ page }) => {
    const user = await signInAs(page, "customer", "api-customer");
    try {
      for (const path of ["/api/admin/live", "/api/admin/export/orders", "/api/cms/media"]) {
        const res = await page.request.get(path, { maxRedirects: 0 });
        expect(REFUSED, `a customer got ${res.status()} from ${path}`).toContain(res.status());
      }
    } finally {
      await user.dispose();
    }
  });

  test("an editor cannot export customers", async ({ page }) => {
    const user = await signInAs(page, "editor", "api-editor");
    try {
      const res = await page.request.get("/api/admin/export/customers", { maxRedirects: 0 });
      expect(REFUSED).toContain(res.status());
    } finally {
      await user.dispose();
    }
  });
});

test.describe("public APIs survive hostile input", () => {
  for (const path of [
    "/api/shipping/pincode?pincode=abc",
    "/api/shipping/pincode?pincode=" + "9".repeat(500),
    "/api/search/suggestions?q=" + encodeURIComponent("'; DROP TABLE \"Product\"; --"),
    "/api/search/suggestions?q=" + "a".repeat(2000),
    "/api/products/summaries?ids=" + "x,".repeat(300),
    "/api/me/state",
  ]) {
    test(`GET ${path.slice(0, 60)}`, { tag: [LIVE_SAFE] }, async ({ request }) => {
      const res = await request.get(path);
      expect(res.status(), `${path.slice(0, 60)} crashed`).toBeLessThan(500);
    });
  }

  test("coupon quote with garbage does not crash", { tag: [LIVE_SAFE] }, async ({ request }) => {
    const res = await request.post("/api/coupons/quote", { data: { code: "<script>", items: "nope" } });
    expect(res.status()).toBeLessThan(500);
  });
});
