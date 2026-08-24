import { deleteTestUsersByPrefix, closeDb } from "./helpers/db";
import { E2E_EMAIL_PREFIX } from "./helpers/auth";

/**
 * One sweep, once, after every worker has finished.
 *
 * ⚠️  This used to live in each spec's `test.afterAll`, and that was a bug that
 * looked like a flake. Spec files run in PARALLEL workers, so:
 *
 *   - auth.spec's afterAll deleted every `e2e-` user — including the admin that
 *     commerce.spec was actively signed in as, which then bounced to /login
 *     mid-test with an error about a missing settings toggle; and
 *   - closeDb() tore down the shared pg pool while other files were still
 *     querying through it.
 *
 * Individual tests still dispose of what they create, in a finally block. This
 * is only the net for a run that crashed before it could.
 */
export default async function globalTeardown() {
  await deleteTestUsersByPrefix(E2E_EMAIL_PREFIX).catch(() => {});
  await closeDb();
}
