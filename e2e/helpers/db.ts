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
