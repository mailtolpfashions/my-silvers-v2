-- Records the size a shopper chose, on both the cart line and the order line.
--
-- Hand-written, like every migration here: `prisma migrate dev` would drop the
-- generated "searchVector" column on Product.
--
-- NOT NULL DEFAULT '' rather than nullable. Postgres treats NULLs as distinct
-- in a unique index, so a nullable size would let the same unsized product be
-- inserted as unlimited separate cart lines — the exact bug the unique
-- constraint exists to prevent.
ALTER TABLE "CartItem"  ADD COLUMN IF NOT EXISTS "size" TEXT NOT NULL DEFAULT '';
ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "size" TEXT NOT NULL DEFAULT '';

-- Re-key cart lines on (cart, product, size) so ring size 7 and ring size 9 are
-- two lines instead of one silently replacing the other.
--
-- Existing rows all carry size '' and are therefore already unique under the
-- new key, so no data needs reconciling before the swap.
DROP INDEX IF EXISTS "CartItem_cartId_productId_key";
CREATE UNIQUE INDEX IF NOT EXISTS "CartItem_cartId_productId_size_key"
  ON "CartItem" ("cartId", "productId", "size");
