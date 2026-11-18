import { Pool } from "pg";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { isRemoteRun } from "./target";

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
  // A remote run (the live shop) must never touch a database — see target.ts.
  if (isRemoteRun()) {
    throw new Error(
      "DB helpers are disabled on a remote run (E2E_BASE_URL is set). Only @live-safe, browser-only tests may run there."
    );
  }
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

export type TestRole = "customer" | "admin" | "editor" | "superadmin";

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
  giftWrapCharge: string;
  codCharge: string;
  isGift: boolean;
  giftMessage: string | null;
} | null> {
  const { rows } = await getPool().query(
    `SELECT "orderNumber", "subtotal", "shippingCharge", "totalAmount",
            "paymentMethod"::text, "paymentStatus"::text, "giftWrapCharge", "codCharge"::text, "isGift", "giftMessage"
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
        -- Never a product another test made: it can vanish mid-test.
        AND p."slug" NOT LIKE 'e2e-%'
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

// ─── Vendor ─────────────────────────────────────────────────────────────────

/** Sets a product's vendor by slug and returns what it was, for restoring. */
export async function setProductVendor(slug: string, vendor: string | null): Promise<string | null> {
  const { rows } = await getPool().query(
    `UPDATE "Product" p SET "vendor" = $2
       FROM (SELECT "id", "vendor" AS old FROM "Product" WHERE "slug" = $1) prev
      WHERE p."id" = prev."id"
      RETURNING prev.old`,
    [slug, vendor]
  );
  return rows[0]?.old ?? null;
}

export async function getProductVendor(slug: string): Promise<string | null> {
  const { rows } = await getPool().query(`SELECT "vendor" FROM "Product" WHERE "slug" = $1`, [slug]);
  return rows[0]?.vendor ?? null;
}

/** Two active products, for tests that need a pair. Sized or not. */
export async function getTwoActiveProducts(): Promise<
  Array<{ id: string; slug: string; name: string; price: string }>
> {
  const { rows } = await getPool().query(
    `SELECT "id", "slug", "name", "price"::text FROM "Product"
      WHERE "isActive" = true AND "slug" NOT LIKE 'e2e-%' ORDER BY "createdAt" ASC LIMIT 2`
  );
  return rows;
}

/** The vendor snapshot on each line of an order. */
export async function getOrderItemVendors(orderNumber: string): Promise<Array<{ vendor: string | null }>> {
  const { rows } = await getPool().query(
    `SELECT oi."vendor" FROM "OrderItem" oi JOIN "Order" o ON o."id" = oi."orderId"
      WHERE o."orderNumber" = $1`,
    [orderNumber]
  );
  return rows;
}

/**
 * A PAID order with one line, written straight to the tables.
 *
 * Only for report tests: a real paid order needs Razorpay to confirm the
 * payment, which no test can do. The checkout path that SETS the snapshot is
 * covered separately in commerce.spec.ts; this exists to check what the
 * report does with one. Removed by deleteOrdersForUser.
 */
export async function insertPaidOrder(opts: {
  userId: string;
  productId: string;
  name: string;
  price: number;
  costPrice: number | null;
  quantity: number;
  vendor: string | null;
}): Promise<string> {
  const orderId = `e2e_${crypto.randomBytes(12).toString("hex")}`;
  const orderNumber = `E2E-${crypto.randomBytes(5).toString("hex").toUpperCase()}`;
  const total = opts.price * opts.quantity;

  await getPool().query(
    `INSERT INTO "Order" ("id", "orderNumber", "userId", "shippingAddress", "paymentMethod",
                          "paymentStatus", "subtotal", "shippingCharge", "totalAmount", "updatedAt")
     VALUES ($1, $2, $3, '{}'::jsonb, 'razorpay', 'paid', $4, 0, $4, NOW())`,
    [orderId, orderNumber, opts.userId, total]
  );
  await getPool().query(
    `INSERT INTO "OrderItem" ("id", "orderId", "productId", "name", "price", "costPrice",
                              "quantity", "vendor")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      `e2e_${crypto.randomBytes(12).toString("hex")}`,
      orderId,
      opts.productId,
      opts.name,
      opts.price,
      opts.costPrice,
      opts.quantity,
      opts.vendor,
    ]
  );
  return orderNumber;
}

/**
 * A bare order for the email-confirmation tests. `guest: true` gives it a
 * confirmationToken, which is what marks an order as placed at guest checkout
 * (see accountOrderScope). Removed by deleteOrdersForUser.
 */
export async function insertOrderForUser(userId: string, guest: boolean): Promise<string> {
  const orderId = `e2e_${crypto.randomBytes(12).toString("hex")}`;
  const orderNumber = `E2E-${crypto.randomBytes(5).toString("hex").toUpperCase()}`;
  await getPool().query(
    `INSERT INTO "Order" ("id", "orderNumber", "userId", "confirmationToken", "shippingAddress",
                          "paymentMethod", "paymentStatus", "subtotal", "shippingCharge",
                          "totalAmount", "updatedAt")
     VALUES ($1, $2, $3, $4, '{}'::jsonb, 'cod', 'pending', 100, 0, 100, NOW())`,
    [orderId, orderNumber, userId, guest ? crypto.randomBytes(24).toString("hex") : null]
  );
  return orderNumber;
}

export async function setEmailVerified(userId: string, verified: boolean): Promise<void> {
  await getPool().query(`UPDATE "User" SET "emailVerified" = $2 WHERE "id" = $1`, [
    userId,
    verified ? new Date() : null,
  ]);
}

export async function setPassword(userId: string, password: string): Promise<void> {
  const passwordHash = await bcrypt.hash(password, 12);
  await getPool().query(`UPDATE "User" SET "passwordHash" = $2 WHERE "id" = $1`, [userId, passwordHash]);
}

/** A coupon straight into the table. Remove with deleteCoupon. */
export async function createCoupon(opts: {
  code: string;
  type: "percent" | "flat";
  value: number;
  minOrderValue?: number | null;
  maxDiscount?: number | null;
  firstOrderOnly?: boolean;
  onePerCustomer?: boolean;
  showToShoppers?: boolean;
}): Promise<void> {
  await getPool().query(
    `INSERT INTO "Coupon" ("id", "code", "type", "value", "minOrderValue", "maxDiscount",
                           "firstOrderOnly", "onePerCustomer", "showToShoppers", "updatedAt")
     VALUES ($1, $2, $3::"CouponType", $4, $5, $6, $7, $8, $9, NOW())`,
    [
      `e2e_${crypto.randomBytes(12).toString("hex")}`,
      opts.code,
      opts.type,
      opts.value,
      opts.minOrderValue ?? null,
      opts.maxDiscount ?? null,
      opts.firstOrderOnly ?? false,
      opts.onePerCustomer ?? true,
      opts.showToShoppers ?? false,
    ]
  );
}

/** Orders that used it keep their couponCode; the FK is SET NULL. */
export async function deleteCoupon(code: string): Promise<void> {
  await getPool().query(`DELETE FROM "Coupon" WHERE "code" = $1`, [code]);
}

export async function getOrderDiscount(
  orderNumber: string
): Promise<{ discount: string; couponCode: string | null } | null> {
  const { rows } = await getPool().query(
    `SELECT "discount"::text, "couponCode" FROM "Order" WHERE "orderNumber" = $1`,
    [orderNumber]
  );
  return rows[0] ?? null;
}

/** The role the database holds right now — for asserting a staff change landed. */
export async function getUserRole(id: string): Promise<string | null> {
  const { rows } = await getPool().query(`SELECT "role" FROM "User" WHERE "id" = $1`, [id]);
  return rows[0]?.role ?? null;
}

/** The newest activity-log summaries recorded for one account. */
export async function activityFor(actorId: string, take = 5): Promise<string[]> {
  const { rows } = await getPool().query(
    `SELECT "summary" FROM "ActivityLog" WHERE "actorId" = $1 ORDER BY "createdAt" DESC LIMIT $2`,
    [actorId, take]
  );
  return rows.map((r: { summary: string }) => r.summary);
}

/**
 * An ONLINE order the shopper never paid for — what closing Razorpay at
 * checkout leaves behind. `hoursAgo` places it inside or past the 24-hour
 * payment window (lib/order-payment.ts). Removed by deleteOrdersForUser.
 */
export async function insertUnpaidOnlineOrder(
  userId: string,
  hoursAgo = 0
): Promise<{ id: string; orderNumber: string }> {
  const id = `e2e_${crypto.randomBytes(12).toString("hex")}`;
  const orderNumber = `E2E-${crypto.randomBytes(5).toString("hex").toUpperCase()}`;
  await getPool().query(
    `INSERT INTO "Order" ("id", "orderNumber", "userId", "shippingAddress", "paymentMethod",
                          "paymentStatus", "orderStatus", "razorpayOrderId", "subtotal",
                          "shippingCharge", "totalAmount", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, '{}'::jsonb, 'razorpay', 'pending', 'placed', $4, 999, 0, 999,
             NOW() - make_interval(hours => $5), NOW())`,
    [id, orderNumber, userId, `order_e2e${crypto.randomBytes(6).toString("hex")}`, hoursAgo]
  );
  return { id, orderNumber };
}

/**
 * An order in any state, for the dashboard tests. `shipped` stamps
 * shipmentCreatedAt, which is what takes an order off the To ship list.
 * Removed by deleteOrdersForUser.
 */
export async function insertOrderInState(
  userId: string,
  opts: {
    paymentMethod: "razorpay" | "cod";
    paymentStatus: "pending" | "paid" | "failed";
    orderStatus?: "placed" | "confirmed" | "shipped" | "cancelled";
    shipped?: boolean;
    total?: number;
  }
): Promise<{ id: string; orderNumber: string }> {
  const id = `e2e_${crypto.randomBytes(12).toString("hex")}`;
  const orderNumber = `E2E-${crypto.randomBytes(5).toString("hex").toUpperCase()}`;
  const total = opts.total ?? 1499;
  await getPool().query(
    `INSERT INTO "Order" ("id", "orderNumber", "userId", "shippingAddress", "paymentMethod",
                          "paymentStatus", "orderStatus", "subtotal", "shippingCharge",
                          "totalAmount", "shipmentCreatedAt", "updatedAt")
     VALUES ($1, $2, $3, '{"fullName":"E2E Buyer","city":"Chennai","phone":"9876543210"}'::jsonb, $4, $5, $6, $7, 0, $7,
             $8, NOW())`,
    [
      id,
      orderNumber,
      userId,
      opts.paymentMethod,
      opts.paymentStatus,
      opts.orderStatus ?? (opts.paymentStatus === "paid" ? "confirmed" : "placed"),
      total,
      opts.shipped ? new Date() : null,
    ]
  );
  return { id, orderNumber };
}

/** A user row as the owner-tools tests need to see it. */
export async function getUserRow(id: string): Promise<{
  email: string;
  name: string | null;
  phone: string | null;
  role: string;
  blockedAt: Date | null;
} | null> {
  const { rows } = await getPool().query(
    `SELECT "email", "name", "phone", "role", "blockedAt" FROM "User" WHERE "id" = $1`,
    [id]
  );
  return rows[0] ?? null;
}

export async function getUserIdByEmail(email: string): Promise<string | null> {
  const { rows } = await getPool().query(`SELECT "id" FROM "User" WHERE "email" = $1`, [email]);
  return rows[0]?.id ?? null;
}

export async function orderExists(id: string): Promise<boolean> {
  const { rows } = await getPool().query(`SELECT 1 FROM "Order" WHERE "id" = $1`, [id]);
  return rows.length > 0;
}

export async function getOrderNote(id: string): Promise<string | null> {
  const { rows } = await getPool().query(`SELECT "adminNote" FROM "Order" WHERE "id" = $1`, [id]);
  return rows[0]?.adminNote ?? null;
}

// ─── QA suite additions (Nov 2026) ──────────────────────────────────────────

/**
 * A product owned by the test that made it: slug `e2e-…`, SKU `E2E-…`, so the
 * teardown sweep and the data-count script can find leftovers. Images are
 * borrowed from an existing product — the page layout expects at least one.
 * Remove with deleteTestProduct (order lines referencing it go first).
 */
export async function createTestProduct(opts: {
  stock: number;
  price?: number;
  name?: string;
  isActive?: boolean;
}): Promise<{ id: string; slug: string; name: string; price: number }> {
  const suffix = crypto.randomBytes(4).toString("hex");
  const id = `e2e_${crypto.randomBytes(12).toString("hex")}`;
  const slug = `e2e-piece-${suffix}`;
  const name = opts.name ?? `E2E Piece ${suffix}`;
  const price = opts.price ?? 1234;
  const { rows: donor } = await getPool().query(
    `SELECT "categoryId", "images" FROM "Product" WHERE "isActive" = true AND cardinality("images") > 0
      ORDER BY "createdAt" ASC LIMIT 1`
  );
  if (!donor[0]) throw new Error("no active product with images to borrow a category from");
  await getPool().query(
    `INSERT INTO "Product" ("id", "name", "slug", "price", "categoryId", "images", "sizes", "tags",
                            "stock", "sku", "isActive", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, $6, '{}', '{}', $7, $8, $9, NOW())`,
    [id, name, slug, price, donor[0].categoryId, donor[0].images, opts.stock, `E2E-${suffix}`, opts.isActive ?? true]
  );
  return { id, slug, name, price };
}

export async function deleteTestProduct(id: string): Promise<void> {
  const p = getPool();
  await p.query(`DELETE FROM "StockNotification" WHERE "productId" = $1`, [id]).catch(() => {});
  await p.query(`DELETE FROM "Review" WHERE "productId" = $1`, [id]).catch(() => {});
  await p.query(`DELETE FROM "CartItem" WHERE "productId" = $1`, [id]).catch(() => {});
  await p.query(`DELETE FROM "OrderItem" WHERE "productId" = $1`, [id]);
  await p.query(`DELETE FROM "Product" WHERE "id" = $1`, [id]);
}

export async function getStock(productId: string): Promise<number> {
  const { rows } = await getPool().query(`SELECT "stock" FROM "Product" WHERE "id" = $1`, [productId]);
  return rows[0]?.stock ?? -1;
}

export async function getProductBySlug(slug: string): Promise<{
  id: string; name: string; price: string; stock: number; isActive: boolean; tags: string[];
} | null> {
  const { rows } = await getPool().query(
    `SELECT "id", "name", "price"::text, "stock", "isActive", "tags" FROM "Product" WHERE "slug" = $1`,
    [slug]
  );
  return rows[0] ?? null;
}

/** Sweep for products a crashed run left behind. */
export async function deleteTestProducts(): Promise<void> {
  const { rows } = await getPool().query(`SELECT "id" FROM "Product" WHERE "slug" LIKE 'e2e-%'`);
  for (const r of rows) await deleteTestProduct(r.id).catch(() => {});
}

/**
 * An order with one line on a given product, in any state, with an order
 * number the TRACKING form accepts. Tracking only understands MYS-<digits>;
 * nine digits starting 9 sits far above the real sequence (order_number_seq
 * is a Postgres sequence, so a hand-written number never moves it).
 * Removed by deleteOrdersForUser.
 */
export async function insertOrderWithItem(opts: {
  userId: string;
  productId: string;
  name: string;
  price: number;
  quantity?: number;
  paymentMethod?: "cod" | "razorpay";
  paymentStatus?: "pending" | "paid" | "failed";
  orderStatus?: "placed" | "confirmed" | "shipped" | "delivered" | "cancelled";
  deliveredDaysAgo?: number | null;
  phone?: string;
  razorpayOrderId?: string | null;
}): Promise<{ id: string; orderNumber: string }> {
  const id = `e2e_${crypto.randomBytes(12).toString("hex")}`;
  const orderNumber = `MYS-9${String(crypto.randomInt(0, 99_999_999)).padStart(8, "0")}`;
  const qty = opts.quantity ?? 1;
  const total = opts.price * qty;
  const address = {
    fullName: "E2E Buyer", phone: opts.phone ?? "9876543210", addressLine1: "12 Test Street",
    city: "Coimbatore", state: "Tamil Nadu", pincode: "641001",
  };
  await getPool().query(
    `INSERT INTO "Order" ("id", "orderNumber", "userId", "shippingAddress", "paymentMethod",
                          "paymentStatus", "orderStatus", "razorpayOrderId", "subtotal", "shippingCharge",
                          "totalAmount", "deliveredAt", "updatedAt")
     VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9, 0, $9,
             CASE WHEN $10::int IS NULL THEN NULL ELSE NOW() - make_interval(days => $10::int) END, NOW())`,
    [
      id, orderNumber, opts.userId, JSON.stringify(address), opts.paymentMethod ?? "cod",
      opts.paymentStatus ?? "pending", opts.orderStatus ?? "placed", opts.razorpayOrderId ?? null,
      total, opts.deliveredDaysAgo ?? null,
    ]
  );
  await getPool().query(
    `INSERT INTO "OrderItem" ("id", "orderId", "productId", "name", "price", "quantity")
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [`e2e_${crypto.randomBytes(12).toString("hex")}`, id, opts.productId, opts.name, opts.price, qty]
  );
  return { id, orderNumber };
}

export async function getOrderState(id: string): Promise<{
  orderStatus: string; paymentStatus: string; refundStatus: string;
} | null> {
  const { rows } = await getPool().query(
    `SELECT "orderStatus"::text, "paymentStatus"::text, "refundStatus"::text FROM "Order" WHERE "id" = $1`,
    [id]
  );
  return rows[0] ?? null;
}

export async function countOrdersForUser(userId: string): Promise<number> {
  const { rows } = await getPool().query(`SELECT count(*)::int n FROM "Order" WHERE "userId" = $1`, [userId]);
  return rows[0].n;
}

export async function getAddresses(userId: string): Promise<Array<{ fullName: string; city: string; isDefault: boolean }>> {
  const { rows } = await getPool().query(
    `SELECT "fullName", "city", "isDefault" FROM "Address" WHERE "userId" = $1 ORDER BY "fullName"`,
    [userId]
  );
  return rows;
}

/** Any single read for raw assertions the named helpers do not cover. */
export async function queryOne<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T | null> {
  const { rows } = await getPool().query(sql, params);
  return (rows[0] as T) ?? null;
}
