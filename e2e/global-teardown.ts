import { deleteTestUsersByPrefix, deleteTestProducts, queryOne, closeDb } from "./helpers/db";
import { E2E_EMAIL_PREFIX } from "./helpers/auth";
import { isRemoteRun } from "./helpers/target";

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
 *
 * Order matters: orders before users and products (their rows reference
 * both), products before nothing else.
 */
export default async function globalTeardown() {
  // A run against the live shop touched no database, so there is nothing to sweep.
  if (isRemoteRun()) return;

  const sweep = (sql: string, params: unknown[] = []) => queryOne(sql, params).catch(() => null);

  // Orders placed by test users (their items first).
  await sweep(
    `DELETE FROM "OrderItem" WHERE "orderId" IN (
       SELECT o."id" FROM "Order" o JOIN "User" u ON u."id" = o."userId" WHERE u."email" LIKE $1)`,
    [`${E2E_EMAIL_PREFIX}%`]
  );
  await sweep(
    `DELETE FROM "Order" WHERE "userId" IN (SELECT "id" FROM "User" WHERE "email" LIKE $1)`,
    [`${E2E_EMAIL_PREFIX}%`]
  );
  await deleteTestProducts().catch(() => {});
  await deleteTestUsersByPrefix(E2E_EMAIL_PREFIX).catch(() => {});
  await sweep(`DELETE FROM "Coupon" WHERE "code" LIKE 'E2E%'`);
  await sweep(`DELETE FROM "NewsletterSubscriber" WHERE "email" LIKE 'e2e-%'`);
  await sweep(`DELETE FROM "StockNotification" WHERE "email" LIKE 'e2e-%'`);
  await sweep(
    `DELETE FROM "ContentEntryVersion" WHERE "entryId" IN (SELECT "id" FROM "ContentEntry" WHERE "slug" LIKE 'e2e-%')`
  );
  await sweep(`DELETE FROM "ContentEntry" WHERE "slug" LIKE 'e2e-%'`);
  await closeDb();
}
