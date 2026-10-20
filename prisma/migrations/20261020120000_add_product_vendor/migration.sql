-- Vendor: who a piece was bought from. Admin-only, like costPrice.
--
-- Hand-written, like every migration here: `prisma migrate dev` would drop the
-- generated "searchVector" column on Product. See the note in schema.prisma.
--
-- Both columns are nullable and have no default, so this is a metadata-only
-- change in Postgres — no table rewrite, safe to run against a live shop.
-- Existing products and past order lines read as "no vendor" until set.

ALTER TABLE "Product" ADD COLUMN "vendor" TEXT;

-- Snapshot taken at order time (see create-order.ts), so a product changing
-- supplier later does not move its past sales to the new one.
ALTER TABLE "OrderItem" ADD COLUMN "vendor" TEXT;

-- The admin product list filters on it, and the vendor suggestions read the
-- distinct values.
CREATE INDEX "Product_vendor_idx" ON "Product"("vendor");
