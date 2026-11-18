/**
 * Which kind of run this is — decided once, from E2E_BASE_URL alone, so the
 * config, the global setup and the DB helpers can never disagree about it.
 *
 *   local  — no E2E_BASE_URL, or one pointing at this machine. The suite starts
 *            (or reuses) a production build on :3100 against .env's database,
 *            which MUST be the dev project. Every layer may run.
 *   remote — E2E_BASE_URL is a real host (the live shop, a preview). The suite
 *            drives a browser at it and nothing else: only `@live-safe` tests
 *            run, and the DB helpers refuse to connect.
 *
 * ⚠️  Why remote runs get no database at all. The helpers read `.env`, and the
 * server under test reads ITS own env. Against the live site those are two
 * different databases: a "create a test user, then sign in as them" test
 * writes the user to dev and then fails to sign in on live — or, if .env was
 * swapped to live values that day, writes to the shop's real tables while
 * customers browse. Neither is a test. So remote means read-only, browser-only.
 */
export const DEV_PROJECT_REF = "skyifgumokdwcgwjupvr";

export function isRemoteRun(): boolean {
  const url = process.env.E2E_BASE_URL;
  if (!url) return false;
  try {
    const host = new URL(url).hostname;
    return !["localhost", "127.0.0.1", "::1"].includes(host);
  } catch {
    return true; // unparseable — assume the cautious answer
  }
}

/** True only when both connection strings name the dev project. Never logs them. */
export function envTargetsDevDatabase(): boolean {
  const a = process.env.DATABASE_URL ?? "";
  const b = process.env.DIRECT_URL ?? "";
  return a.includes(DEV_PROJECT_REF) && (b === "" || b.includes(DEV_PROJECT_REF));
}

/** Tag for tests that are safe to run against the live shop. */
export const LIVE_SAFE = "@live-safe";
export const SMOKE = "@smoke";
