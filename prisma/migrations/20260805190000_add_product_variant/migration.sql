-- Per-size stock.
--
-- Hand-written, like every migration here: `prisma migrate dev` would drop the
-- generated "searchVector" column on Product.

CREATE TABLE IF NOT EXISTS "ProductVariant" (
  "id"        TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "size"      TEXT NOT NULL,
  "stock"     INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "ProductVariant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProductVariant_productId_size_key"
  ON "ProductVariant" ("productId", "size");
CREATE INDEX IF NOT EXISTS "ProductVariant_productId_idx"
  ON "ProductVariant" ("productId");

ALTER TABLE "ProductVariant"
  ADD CONSTRAINT "ProductVariant_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Backfill ────────────────────────────────────────────────────────────────
-- Every existing sized product carries one stock number. Split it evenly across
-- its sizes, giving the remainder to the earliest sizes, so the per-size figures
-- still sum to exactly the product total and nothing becomes unbuyable.
--
--   stock 20 over 4 sizes -> 5, 5, 5, 5
--   stock 22 over 4 sizes -> 6, 6, 5, 5
--
-- ordinality gives each size its position in Product.sizes, which is what
-- decides who receives a remainder unit.
INSERT INTO "ProductVariant" ("id", "productId", "size", "stock")
SELECT
  -- gen_random_uuid() is available without an extension on PG 13+. Prisma only
  -- generates cuids on the client, so rows created by SQL need their own id.
  gen_random_uuid()::text,
  p."id",
  s."size",
  (p."stock" / cardinality(p."sizes"))
    + CASE WHEN s."ord" <= (p."stock" % cardinality(p."sizes")) THEN 1 ELSE 0 END
FROM "Product" p
CROSS JOIN LATERAL unnest(p."sizes") WITH ORDINALITY AS s("size", "ord")
WHERE cardinality(p."sizes") > 0
ON CONFLICT ("productId", "size") DO NOTHING;
