import { defineConfig, devices } from "@playwright/test";
import { config as loadEnv } from "dotenv";

// Next loads .env itself; this process does not, and the suite needs
// DATABASE_URL to set up and tear down its own fixtures.
loadEnv();

/**
 * End-to-end suite.
 *
 * Runs against a PRODUCTION build (`next build` + `next start`) rather than the
 * dev server, deliberately. Three of the things worth testing here only exist
 * in a production build: the security headers, PPR's static shell, and the
 * rate limiter's fail-closed branch, which keys off NODE_ENV. A dev-server
 * suite would pass while saying nothing about what ships.
 *
 * Set E2E_BASE_URL to point the suite at a deployed preview instead; the local
 * server is then not started at all.
 */
const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const usingLocalServer = !process.env.E2E_BASE_URL;

/**
 * Shared between this config (which hands it to the server) and the webhook
 * spec (which signs payloads with it). Exported rather than duplicated so the
 * two can never drift into a test that passes because both sides are wrong.
 */
export const WEBHOOK_TEST_SECRET = "e2e-razorpay-webhook-secret-do-not-deploy";

export default defineConfig({
  testDir: "./e2e",
  globalTeardown: "./e2e/global-teardown.ts",
  // Full isolation between files; the suite touches a shared database.
  fullyParallel: true,
  // A stray test.only in CI is a silently reduced suite.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Capped locally too: the Supabase pooler and the pg pool (max 5 per process)
  // are a shared budget, and 12 workers hammering checkout exhausts it.
  workers: process.env.CI ? 2 : 4,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"], ["html", { open: "never" }]],

  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile",
      use: { ...devices["Pixel 7"] },
      /**
       * Only the specs where the viewport changes the answer.
       *
       * The rest assert server-side behaviour — HMAC verification, role
       * revocation, the totals create-order.ts computes — which cannot differ
       * by screen width, so a second run proves nothing. Worse, commerce.spec
       * mutates the single-row StoreSetting table: running it in two projects
       * at once means two suites fighting over one global resource, which is
       * exactly how it started failing.
       */
      testMatch: /(storefront|access-control)\.spec\.ts/,
    },
  ],

  ...(usingLocalServer && {
    webServer: {
      command: "npm run start",
      url: baseURL,
      // Never reuse in CI; locally, reuse whatever is already running so the
      // suite does not rebuild between runs.
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        /**
         * `next start` sets NODE_ENV=production, where the limiter now fails
         * CLOSED on missing Upstash config (see limiter.ts). Without this the
         * suite cannot even sign in — every login is refused by design.
         *
         * Set here rather than in .env so it stays scoped to the test server
         * and can never follow a real deployment.
         */
        RATE_LIMIT_FAIL_OPEN: "1",

        /**
         * A known webhook secret, so the suite can sign payloads the way
         * Razorpay would and assert that a FORGED one is refused. Without it
         * the signature path is untestable — the repo's own .env carries a
         * placeholder — and signature verification is the single control
         * standing between a stranger's HTTP request and a fulfilled order.
         *
         * Test-server scope only. It never reaches a deployment, and the live
         * secret is whatever Razorpay issues.
         */
        RAZORPAY_WEBHOOK_SECRET: WEBHOOK_TEST_SECRET,
      },
    },
  }),
});
