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

export default defineConfig({
  testDir: "./e2e",
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
    { name: "mobile", use: { ...devices["Pixel 7"] } },
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
      },
    },
  }),
});
