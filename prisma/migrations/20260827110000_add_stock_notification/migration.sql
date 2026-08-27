-- Back-in-stock alerts: who to tell when a sold-out piece returns.
--
-- Hand-written, like every migration here: `prisma migrate dev` would drop the
-- generated "searchVector" column on Product. See the note in schema.prisma.
--
-- `size` is an empty string and never NULL, matching CartItem. Postgres treats
-- NULLs as DISTINCT in a unique index, so a nullable column here would let the
-- same person register for the same unsized product without limit — one row per
-- click — and then receive that many emails when it came back.

CREATE TABLE "StockNotification" (
  "id"         TEXT NOT NULL,
  "productId"  TEXT NOT NULL,
  "size"       TEXT NOT NULL DEFAULT '',
  "email"      TEXT NOT NULL,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "notifiedAt" TIMESTAMP(3),

  CONSTRAINT "StockNotification_pkey" PRIMARY KEY ("id")
);

-- One request per person per size. Asking twice is not two alerts, and the
-- upsert in subscribe() relies on this constraint to be idempotent.
CREATE UNIQUE INDEX "StockNotification_productId_size_email_key"
  ON "StockNotification"("productId", "size", "email");

-- The restock query: everyone still waiting on one product+size. Partial,
-- because a row that has already been notified is history and is never read by
-- the send path — and history is most of this table after a few months.
CREATE INDEX "StockNotification_pending_idx"
  ON "StockNotification"("productId", "size") WHERE "notifiedAt" IS NULL;

-- Deleting a product takes its waiting list with it. Nobody can be told that a
-- piece which no longer exists is back.
ALTER TABLE "StockNotification"
  ADD CONSTRAINT "StockNotification_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
