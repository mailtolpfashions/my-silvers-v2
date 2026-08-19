-- The partners' books: cost of goods, expenses, investors and contributions.
--
-- Hand-written, like every migration here: `prisma migrate dev` would drop the
-- generated "searchVector" column on Product. See the note in schema.prisma.

-- ── Cost of goods ───────────────────────────────────────────────────────────
-- What a piece cost US. Nullable because the catalogue predates it: a product
-- with no cost is excluded from margin figures rather than counted as free, and
-- the finance screens report how many are missing.
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "costPrice" DECIMAL(10,2);

-- Snapshot at the moment of sale, exactly like OrderItem."price".
--
-- Load-bearing: reading cost off the live Product instead would mean
-- re-pricing stock next year silently rewrites last year's profit.
ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "costPrice" DECIMAL(10,2);

-- ── Expenses ────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "ExpenseCategory" AS ENUM ('stock', 'packaging', 'shipping', 'marketing', 'salaries', 'platform', 'other');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "Expense" (
  "id"           TEXT NOT NULL,
  -- When the money was actually spent, which is not always when it was
  -- entered. Every report groups on this, never on "createdAt".
  "spentAt"      TIMESTAMP(3) NOT NULL,
  "amount"       DECIMAL(10,2) NOT NULL,
  "category"     "ExpenseCategory" NOT NULL DEFAULT 'other',
  "note"         TEXT,
  "recordedById" TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- SetNull, not Cascade: removing a staff account must never delete the books.
-- It forgets who typed the entry in; it does not forget the money.
ALTER TABLE "Expense" DROP CONSTRAINT IF EXISTS "Expense_recordedById_fkey";
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_recordedById_fkey"
  FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "Expense_spentAt_idx" ON "Expense"("spentAt");
CREATE INDEX IF NOT EXISTS "Expense_category_spentAt_idx" ON "Expense"("category", "spentAt");

-- ── Investors ───────────────────────────────────────────────────────────────
-- Deliberately NOT a User: an investor may never log in, and an admin account
-- is not automatically a stakeholder. Linking them would mean deleting a login
-- deletes someone's stake.
CREATE TABLE IF NOT EXISTS "Investor" (
  "id"          TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "email"       TEXT,
  "phone"       TEXT,
  -- Set by hand, NOT derived from contributions — stakes here reflect effort as
  -- well as cash, so the two drift apart on purpose. The finance screen shows
  -- both and flags when the shares do not total 100.
  "profitShare" DECIMAL(5,2) NOT NULL DEFAULT 0,
  -- Kept rather than deleted when someone leaves, so historical reports still
  -- balance: a period they were part of must not silently re-split.
  "isActive"    BOOLEAN NOT NULL DEFAULT true,
  "note"        TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Investor_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Investor_isActive_idx" ON "Investor"("isActive");

CREATE TABLE IF NOT EXISTS "Investment" (
  "id"         TEXT NOT NULL,
  "investorId" TEXT NOT NULL,
  "amount"     DECIMAL(10,2) NOT NULL,
  -- When the money arrived. Reports group on this, never on "createdAt".
  "investedAt" TIMESTAMP(3) NOT NULL,
  "note"       TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Investment_pkey" PRIMARY KEY ("id")
);

-- Cascade here, unlike Expense: a contribution has no meaning without the
-- investor it belongs to, and Investor is soft-deleted via isActive anyway, so
-- a hard delete is an explicit "this person was never part of this".
ALTER TABLE "Investment" DROP CONSTRAINT IF EXISTS "Investment_investorId_fkey";
ALTER TABLE "Investment" ADD CONSTRAINT "Investment_investorId_fkey"
  FOREIGN KEY ("investorId") REFERENCES "Investor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "Investment_investorId_investedAt_idx" ON "Investment"("investorId", "investedAt");
CREATE INDEX IF NOT EXISTS "Investment_investedAt_idx" ON "Investment"("investedAt");
