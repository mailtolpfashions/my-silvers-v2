-- Timestamps on carts, so an abandoned one can be aged.
--
-- Hand-written, like every migration here: `prisma migrate dev` would drop the
-- generated "searchVector" column on Product. See the note in schema.prisma.

ALTER TABLE "Cart" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- On the ITEM, not the Cart: adding a line never writes the Cart row, so a
-- timestamp up there would never move after creation. "Last activity" for a
-- cart is max("updatedAt") across its items.
--
-- ⚠️  Existing rows get CURRENT_TIMESTAMP, so every cart that already exists
-- will read as active today until it is next touched. The ages on the abandoned
-- carts screen only become truthful for activity from this migration onwards.
ALTER TABLE "CartItem" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "CartItem" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS "CartItem_updatedAt_idx" ON "CartItem"("updatedAt" DESC);
