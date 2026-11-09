#!/usr/bin/env node
/**
 * Runs ONE command against the LIVE database: `npm run live -- <command>`.
 *
 *   npm run db:live:status     → which migrations the live DB is missing (read-only)
 *   npm run db:live:migrate    → apply them (prisma migrate deploy)
 *   npm run live -- node some-read-only-script.cjs
 *
 * Why this exists. `.env` is for the DEV database, always — the dev server, the
 * e2e suite and the demo scripts all read it, and the e2e suite creates and
 * deletes users, orders and coupons and flips store settings. The live
 * connection details live in `.env.live` instead, which nothing loads by
 * accident: Next.js only auto-loads .env, .env.local and .env.<mode>(.local),
 * and git ignores every .env* file.
 *
 * Loaded with override, so these values win over anything in .env for this
 * one command. Never prints a connection string.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { parse } from "dotenv";

const DEV_PROJECT_REF = "skyifgumokdwcgwjupvr";
const args = process.argv.slice(2);

if (args.length === 0) {
  console.error("Usage: npm run live -- <command> [args…]");
  process.exit(2);
}
if (!existsSync(".env.live")) {
  console.error(".env.live not found. Create it with the live DATABASE_URL and DIRECT_URL (from Vercel).");
  process.exit(2);
}

const live = parse(readFileSync(".env.live"));
if (!live.DIRECT_URL || !live.DATABASE_URL) {
  console.error(".env.live must set both DATABASE_URL and DIRECT_URL.");
  process.exit(2);
}
if (live.DIRECT_URL.includes(DEV_PROJECT_REF) || live.DATABASE_URL.includes(DEV_PROJECT_REF)) {
  console.error(".env.live points at the DEV database — refusing. Put the live values in it.");
  process.exit(2);
}

console.log("▶ Running against the LIVE database:", args.join(" "));
// A shell on Windows so `npx` (npx.cmd) resolves — which also means arguments
// with spaces ("E:\MY Silvers\…") must be quoted, or the shell splits them.
const onWindows = process.platform === "win32";
const quoted = onWindows ? args.map((a) => (/[\s&()^]/.test(a) ? `"${a}"` : a)) : args;
const result = spawnSync(quoted[0], quoted.slice(1), {
  stdio: "inherit",
  shell: onWindows,
  env: { ...process.env, ...live },
});
process.exit(result.status ?? 1);
