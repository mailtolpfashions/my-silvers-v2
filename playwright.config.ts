import { defineConfig, devices } from "@playwright/test";
import { config as loadEnv } from "dotenv";
import { isRemoteRun, LIVE_SAFE } from "./e2e/helpers/target";

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
/**
 * 3100, not 3000 — deliberately off the dev server's port.
 *
 * ⚠️  This is not a preference. `reuseExistingServer` will happily adopt
 * whatever is already listening, and a `next dev` left open in an editor is
 * NOT what this suite is meant to run against: dev builds carry 'unsafe-eval'
 * in the CSP, ship unminified bundles four times the size, and never receive
 * the webServer `env` below. The result was twelve failures that looked like
 * real regressions and were nothing of the sort — a budget assertion reading
 * 4,606kB against a 1,200kB limit, and a webhook refusing a correctly signed
 * payload because the test secret was never set.
 *
 * Giving the suite its own port means a dev server can stay open beside it and
 * the two never meet.
 */
/**
 * Rate-limit mode (`npm run test:ratelimits`): a SEPARATE server, on its own
 * port, with the limiter switched ON — the normal server runs with
 * RATE_LIMIT_FAIL_OPEN=1 so a busy suite is not throttled by its own speed,
 * which means no ordinary run can prove a limit works. Only @ratelimit tests
 * run in this mode, and only in it.
 */
const rateLimitMode = process.env.E2E_RATE_LIMITS === "1";
/** Load mode (`npm run test:load`): only @load tests — many shoppers at once. */
const loadMode = process.env.E2E_LOAD === "1";
const TEST_PORT = rateLimitMode ? 3101 : 3100;
/** Tags that only run in their own mode, never in an ordinary run. */
const SPECIAL = /@ratelimit|@load/;

const baseURL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${TEST_PORT}`;
const usingLocalServer = !process.env.E2E_BASE_URL;
/** Against the live shop (or any real host): browser-only, read-only. See e2e/helpers/target.ts. */
const remote = isRemoteRun();

/**
 * Shared between this config (which hands it to the server) and the webhook
 * spec (which signs payloads with it). Exported rather than duplicated so the
 * two can never drift into a test that passes because both sides are wrong.
 */
export const WEBHOOK_TEST_SECRET = "e2e-razorpay-webhook-secret-do-not-deploy";
export const CRON_TEST_SECRET = "e2e-cron-secret-do-not-deploy";

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  /**
   * A remote run executes ONLY tests tagged @live-safe, whatever the command
   * line asked for. Enforced here rather than trusted to a script, because
   * `E2E_BASE_URL=… npx playwright test` (the old launch checklist) would
   * otherwise run order-placing, settings-flipping specs against real
   * customers.
   */
  ...(remote && { grep: new RegExp(LIVE_SAFE) }),
  ...(!remote && rateLimitMode && { grep: /@ratelimit/ }),
  ...(!remote && loadMode && { grep: /@load/ }),
  ...(!remote && !rateLimitMode && !loadMode && { grepInvert: SPECIAL }),
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
    // Kept for every failure, not only retries: locally there are no retries,
    // so "on-first-retry" meant a local failure never had a trace to open.
    trace: "retain-on-failure",
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
      testMatch: /(storefront|access-control|catalogue|product|live-smoke)\.spec\.ts/,
    },
    /**
     * iPhone Safari, smoke only. A real share of Indian shoppers browse on
     * iPhones, and WebKit is where layout and storage quirks show up — but the
     * functional specs assert server behaviour that cannot differ by engine,
     * so running all of them a third time would only cost time.
     */
    // ⚠️  A project-level grep REPLACES the top-level one, so on a remote run
    // this must be the live-safe filter, not the smoke one — otherwise @smoke
    // tests that write data are started against the live shop. (Caught in the
    // Nov 2026 QA run, where the DB guard in helpers/db.ts stopped every one of
    // them at its first query, before anything was written.)
    //
    // REMOTE (https) runs only. Against the local http://127.0.0.1 server,
    // Playwright's Windows WebKit drops the Secure session cookie (sign-in
    // never lands) and the catalogue failed to render — while the same tests
    // passed on the live https site. Locally it measured the test machine,
    // not the shop.
    ...(remote ? [{ name: "webkit", use: { ...devices["iPhone 14"] }, grep: new RegExp(LIVE_SAFE) }] : []),
  ],

  ...(usingLocalServer && {
    webServer: {
      /**
       * `next` directly, not `npm run start`.
       *
       * ⚠️  npm spawns the real server as a GRANDCHILD of itself. Playwright
       * signals the process it started — the npm wrapper — and on Windows the
       * `next start` underneath survives it, holding the port. The next run
       * then starts a second server, and the two take turns being killed:
       * the symptom was ERR_CONNECTION_REFUSED scattered across both projects
       * mid-run, with two boot lines in the log where there should be one.
       *
       * One process, one thing to kill.
       */
      command: `npx next start --port ${TEST_PORT}`,
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
        // "0" in rate-limit mode — the limiter ON, against the dev Upstash.
        RATE_LIMIT_FAIL_OPEN: rateLimitMode ? "0" : "1",

        /**
         * The server has to be told where it lives.
         *
         * ⚠️  `proxy.ts` builds its login redirect from `req.nextUrl.origin`,
         * and under NextAuth's `auth()` wrapper that origin comes from
         * AUTH_URL — NOT from the incoming request. With `.env`'s
         * `http://localhost:3000` still in effect, every gated route on this
         * server answered `307 → http://localhost:3000/login`, a port with
         * nothing behind it, and the browser reported ERR_CONNECTION_REFUSED
         * against the original URL. Twenty-eight tests failed, all of them
         * exactly the routes in the proxy matcher, while curl saw a perfectly
         * good 307 because it was not following it.
         *
         * It only ever passed before because the suite ran on 3000 and the
         * stale redirect happened to land back on itself.
         */
        AUTH_URL: baseURL,
        APP_BASE_URL: baseURL,

        /**
         * ⚠️  Blanked so the suite CANNOT talk to Shiprocket.
         *
         * Shiprocket has no sandbox — those credentials are the live account —
         * and it LOCKS the account after repeated failed logins, a lock that
         * defeats the correct password afterwards. The checkout page runs a
         * pincode serviceability lookup, so every run of this suite was
         * attempting a real login; with a wrong password in .env that meant
         * each run spent attempts, and it re-locked the account during the
         * audit's own testing.
         *
         * `login()` checks for missing credentials and throws BEFORE any fetch,
         * so empty strings mean no request leaves the machine. The storefront
         * degrades to "serviceability unavailable", which is the behaviour a
         * shopper sees during a Shiprocket outage anyway — worth exercising.
         *
         * To test the integration for real, run against a deployment with
         * proper credentials rather than turning this back on.
         */
        SHIPROCKET_EMAIL: "",
        SHIPROCKET_PASSWORD: "",

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

        /**
         * No real email leaves a test run — see deliver() in
         * src/server/email/resend.ts. Without it every placed test order sent
         * a confirmation to an @example.test address (a hard bounce) and a
         * new-order alert to the owner's real inbox.
         */
        E2E_EMAIL_DRY_RUN: "1",

        /** Cron endpoints are tested with a known secret, never the real one. */
        CRON_SECRET: CRON_TEST_SECRET,
      },
    },
  }),
});
