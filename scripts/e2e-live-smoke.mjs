#!/usr/bin/env node
/**
 * `npm run test:smoke:live [-- <url>]` — the read-only smoke pack against the
 * live shop (default https://www.mysilvers.in).
 *
 * A script rather than an inline `E2E_BASE_URL=… playwright test` because npm
 * runs scripts under cmd.exe on Windows, where that syntax does not exist.
 *
 * Safety does not live here: playwright.config.ts sees a non-local
 * E2E_BASE_URL and runs ONLY @live-safe tests, and the DB helpers refuse to
 * connect (e2e/helpers/target.ts). This script just sets the URL.
 */
import { spawnSync } from "node:child_process";

const url = process.argv[2] ?? "https://www.mysilvers.in";
const onWindows = process.platform === "win32";

const result = spawnSync("npx", ["playwright", "test", "--project=chromium", "--project=mobile", "--project=webkit"], {
  stdio: "inherit",
  shell: onWindows,
  env: { ...process.env, E2E_BASE_URL: url },
});
process.exit(result.status ?? 1);
