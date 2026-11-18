import { config as loadEnv } from "dotenv";
import { envTargetsDevDatabase, isRemoteRun } from "./helpers/target";

/**
 * The gate every run passes before a single test starts.
 *
 * The suite creates and deletes users, orders, products and coupons, and flips
 * store settings. `.env` is meant to be the DEV database, but it has been
 * swapped to live values by hand more than once — and nothing else would
 * notice before the first test wrote to the real shop. So a local run refuses
 * outright unless both connection strings name the dev project.
 *
 * Prints only "dev"/"not dev". Connection strings never reach the console.
 */
export default async function globalSetup() {
  loadEnv();

  if (isRemoteRun()) {
    console.log(
      `\n▶ Remote run against ${process.env.E2E_BASE_URL} — read-only: only @live-safe tests, no database access.\n`
    );
    return;
  }

  if (!envTargetsDevDatabase()) {
    throw new Error(
      "Refusing to run: .env's DATABASE_URL/DIRECT_URL do not point at the DEV database. " +
        "The e2e suite writes test data. Put the dev values back in .env (live ones belong in .env.live)."
    );
  }
  console.log("\n▶ Database check: dev ✓\n");
}
