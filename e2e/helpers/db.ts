import { Pool } from "pg";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";

/**
 * Direct database access for tests, over `pg` rather than Prisma.
 *
 * ⚠️  Not a style preference. Prisma 7 emits an ESM-only client that uses
 * `import.meta`, and Playwright's transform loads spec files as CommonJS — so
 * `import { prisma } from "@/server/db"` dies at collection time with
 * "Cannot use 'import.meta' outside a module". Going straight to `pg` sidesteps
 * that entirely, and has the side benefit that these tests keep working if the
 * ORM is ever swapped: they assert what is in the table, not what Prisma thinks
 * is in the table.
 *
 * The columns written by hand are the ones Prisma would otherwise fill in:
 * `id` and `updatedAt` have no database-level default (see the init migration),
 * so a raw INSERT must supply both.
 */

let pool: Pool | null = null;

function getPool(): Pool {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is not set. The e2e suite needs the same database the server under test is using."
    );
  }
  // Deliberately tiny: this pool exists alongside the app's own, against the
  // same Supabase pooler, and connection slots are a shared budget.
  pool ??= new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
  return pool;
}

export async function closeDb(): Promise<void> {
  await pool?.end().catch(() => {});
  pool = null;
}

export type TestRole = "customer" | "admin" | "editor";

/** A throwaway account with a known password, for sign-in flows. */
export async function createTestUser(opts: {
  email: string;
  password: string;
  role: TestRole;
  name?: string;
}): Promise<{ id: string }> {
  const id = `e2e_${crypto.randomBytes(12).toString("hex")}`;
  const passwordHash = await bcrypt.hash(opts.password, 12);

  await getPool().query(
    `INSERT INTO "User" ("id", "email", "name", "role", "passwordHash", "updatedAt")
     VALUES ($1, $2, $3, $4::"Role", $5, NOW())`,
    [id, opts.email, opts.name ?? "E2E User", opts.role, passwordHash]
  );

  return { id };
}

/** Changes a role underneath a live session — the premise of the F-01 tests. */
export async function setUserRole(id: string, role: TestRole): Promise<void> {
  await getPool().query(`UPDATE "User" SET "role" = $2::"Role", "updatedAt" = NOW() WHERE "id" = $1`, [
    id,
    role,
  ]);
}

export async function deleteUser(id: string): Promise<void> {
  await getPool().query(`DELETE FROM "User" WHERE "id" = $1`, [id]);
}

/** Sweeps anything a crashed run left behind. */
export async function deleteTestUsersByPrefix(prefix: string): Promise<void> {
  await getPool().query(`DELETE FROM "User" WHERE "email" LIKE $1`, [`${prefix}%`]);
}

/**
 * The order a test just placed, with the figures the SERVER computed.
 *
 * Read straight from the table rather than scraped off the confirmation page,
 * because the point of the assertion is what was persisted — the client is
 * exactly the party whose arithmetic is not trusted.
 */
export async function getLatestOrderForUser(userId: string): Promise<{
  orderNumber: string;
  subtotal: string;
  shippingCharge: string;
  totalAmount: string;
  paymentMethod: string;
  paymentStatus: string;
  isGift: boolean;
  giftMessage: string | null;
} | null> {
  const { rows } = await getPool().query(
    `SELECT "orderNumber", "subtotal", "shippingCharge", "totalAmount",
            "paymentMethod"::text, "paymentStatus"::text, "isGift", "giftMessage"
       FROM "Order"
      WHERE "userId" = $1
      ORDER BY "createdAt" DESC
      LIMIT 1`,
    [userId]
  );
  return rows[0] ?? null;
}

/** Deletes an order and its items, so a placed test order leaves no residue. */
export async function deleteOrdersForUser(userId: string): Promise<void> {
  await getPool().query(
    `DELETE FROM "OrderItem" WHERE "orderId" IN (SELECT "id" FROM "Order" WHERE "userId" = $1)`,
    [userId]
  );
  await getPool().query(`DELETE FROM "Order" WHERE "userId" = $1`, [userId]);
}

/** An in-stock product, for building a cart that can actually be checked out. */
export async function getInStockProduct(): Promise<{
  slug: string;
  price: string;
  name: string;
} | null> {
  const { rows } = await getPool().query(
    `SELECT p."slug", p."price"::text, p."name"
       FROM "Product" p
      WHERE p."stock" > 0
        AND p."isActive" = true
        AND NOT EXISTS (SELECT 1 FROM "ProductVariant" v WHERE v."productId" = p."id")
      ORDER BY p."price" ASC
      LIMIT 1`
  );
  return rows[0] ?? null;
}

/**
 * An order's line items, each paired with the product's CURRENT catalogue price.
 *
 * The pairing is the point: it lets a test assert that the price the server
 * snapshotted into the order is the price in the Product table, and not
 * something that arrived from the browser.
 */
export async function getOrderItemsWithCatalogPrice(orderNumber: string): Promise<
  Array<{ name: string; quantity: number; itemPrice: string; catalogPrice: string | null }>
> {
  const { rows } = await getPool().query(
    `SELECT oi."name",
            oi."quantity",
            oi."price"::text  AS "itemPrice",
            p."price"::text   AS "catalogPrice"
       FROM "OrderItem" oi
       JOIN "Order" o  ON o."id" = oi."orderId"
       LEFT JOIN "Product" p ON p."id" = oi."productId"
      WHERE o."orderNumber" = $1`,
    [orderNumber]
  );
  return rows;
}

/**
 * Puts the store settings back to the values coded as defaults.
 *
 * Deleting the row would be simpler, but the storefront caches settings reads
 * for up to 60s and only the admin save action invalidates that tag — so a
 * direct delete leaves the app quoting whatever a test last set. This is the
 * crash net; the happy path restores through the admin form.
 */
export async function resetStoreSettings(): Promise<void> {
  await getPool().query(`DELETE FROM "StoreSetting" WHERE "key" = 'store'`);
}
