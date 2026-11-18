#!/usr/bin/env node
/**
 * Row counts the e2e suite could leave behind — run before and after a test
 * run and diff the two (`node scripts/e2e-data-counts.mjs`).
 *
 * Read-only. Reads .env, refuses anything but the dev database, and prints
 * only table names and numbers — never a connection string.
 */
import { config } from "dotenv";
import pg from "pg";

config();
const DEV_PROJECT_REF = "skyifgumokdwcgwjupvr";
if (!(process.env.DATABASE_URL ?? "").includes(DEV_PROJECT_REF)) {
  console.error("Refusing: .env does not point at the dev database.");
  process.exit(2);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const q = async (sql) => Number((await pool.query(sql)).rows[0].n);

const counts = {
  users: await q(`SELECT count(*) n FROM "User"`),
  e2eUsers: await q(`SELECT count(*) n FROM "User" WHERE email LIKE 'e2e-%'`),
  orders: await q(`SELECT count(*) n FROM "Order"`),
  e2eOrders: await q(`SELECT count(*) n FROM "Order" WHERE "orderNumber" LIKE 'E2E-%'`),
  products: await q(`SELECT count(*) n FROM "Product"`),
  e2eProducts: await q(`SELECT count(*) n FROM "Product" WHERE slug LIKE 'e2e-%'`),
  totalStock: await q(`SELECT coalesce(sum(stock),0) n FROM "Product"`),
  coupons: await q(`SELECT count(*) n FROM "Coupon"`),
  categories: await q(`SELECT count(*) n FROM "Category"`),
  reviews: await q(`SELECT count(*) n FROM "Review"`),
  addresses: await q(`SELECT count(*) n FROM "Address"`),
  storeSettingRows: await q(`SELECT count(*) n FROM "StoreSetting"`),
};
console.log(JSON.stringify(counts, null, 2));
await pool.end();
