#!/usr/bin/env node
/**
 * Runs one of the suite's special modes, which never run in an ordinary pass:
 *
 *   npm run test:ratelimits  → `ratelimits`: its own server on :3101 with the
 *                              limiter ON (dev Upstash); @ratelimit tests only.
 *   npm run test:load        → `load`: many shoppers checking out at once
 *                              against the local build; @load tests only.
 *
 * A script because npm runs scripts under cmd.exe on Windows, where
 * `VAR=1 cmd` does not exist. Extra args pass through to Playwright.
 */
import { spawnSync } from "node:child_process";

const [mode, ...rest] = process.argv.slice(2);
const env = { ratelimits: { E2E_RATE_LIMITS: "1" }, load: { E2E_LOAD: "1" } }[mode];
if (!env) {
  console.error("usage: node scripts/e2e-mode.mjs <ratelimits|load> [playwright args…]");
  process.exit(2);
}

const onWindows = process.platform === "win32";
const result = spawnSync("npx", ["playwright", "test", "--project=chromium", ...rest], {
  stdio: "inherit",
  shell: onWindows,
  env: { ...process.env, ...env },
});
process.exit(result.status ?? 1);
