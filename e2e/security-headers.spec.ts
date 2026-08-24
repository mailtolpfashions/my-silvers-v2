import { test, expect } from "@playwright/test";

/**
 * Regression cover for F-02 (audit, Aug 2026): the site shipped with no
 * security headers at all. These assert the headers exist and keep their
 * meaning — a CSP that quietly loses `frame-ancestors`, or an HSTS max-age
 * edited down to a token value, is the failure mode worth catching.
 *
 * Headers are set in next.config.ts and applied by `next start`, so this only
 * means anything against a production build. See playwright.config.ts.
 */
test.describe("security headers", () => {
  test("sends the baseline header set on a storefront page", async ({ request }) => {
    const response = await request.get("/");
    expect(response.status()).toBe(200);

    const headers = response.headers();

    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["permissions-policy"]).toContain("camera=()");

    // Two years. Written as a number so shortening it fails loudly rather than
    // passing a substring match.
    const hsts = headers["strict-transport-security"] ?? "";
    const maxAge = Number(/max-age=(\d+)/.exec(hsts)?.[1] ?? 0);
    expect(maxAge).toBeGreaterThanOrEqual(63072000);
    expect(hsts).toContain("includeSubDomains");
  });

  test("does not advertise the framework", async ({ request }) => {
    const response = await request.get("/");
    expect(response.headers()["x-powered-by"]).toBeUndefined();
  });

  test("CSP keeps the directives that close XSS escalation routes", async ({ request }) => {
    const response = await request.get("/");
    const headers = response.headers();

    // Report-Only during rollout; the assertion accepts either key so that
    // flipping to enforcement does not break the suite.
    const csp =
      headers["content-security-policy"] ?? headers["content-security-policy-report-only"];
    expect(csp, "no CSP header of either kind was sent").toBeTruthy();

    // These four are what buy back the 'unsafe-inline' that PPR forces on
    // script-src. Losing any of them silently is the regression to catch.
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
  });

  test("CSP still admits the third parties checkout depends on", async ({ request }) => {
    const response = await request.get("/");
    const headers = response.headers();
    const csp =
      headers["content-security-policy"] ?? headers["content-security-policy-report-only"];

    // A CSP that blocks these does not fail at build time — it fails silently
    // in the browser, at the payment step, for real customers.
    expect(csp).toContain("https://checkout.razorpay.com");
    expect(csp).toContain("https://api.razorpay.com");
    expect(csp).toContain("https://res.cloudinary.com");
  });

  test("production builds never allow unsafe-eval", async ({ request }) => {
    const response = await request.get("/");
    const headers = response.headers();
    const csp =
      headers["content-security-policy"] ?? headers["content-security-policy-report-only"];

    // 'unsafe-eval' is gated to development in next.config.ts. If it appears
    // here, either the gate broke or the suite is pointed at a dev server —
    // both worth failing on.
    expect(csp).not.toContain("unsafe-eval");
  });
});
