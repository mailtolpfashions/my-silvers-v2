-- Gift orders: a flag and the message to write on the card.
--
-- Hand-written, like every migration here: `prisma migrate dev` would drop the
-- generated "searchVector" column on Product. See the note in schema.prisma.
--
-- Both columns are additive and nullable-or-defaulted, so this is safe to apply
-- to a live table with orders in it — no backfill is needed and no existing row
-- changes meaning. An order placed before this migration is not a gift, which
-- is exactly what `DEFAULT false` says about it.
--
-- `giftMessage` is deliberately separate from `notes` rather than folded into
-- it. Notes are instructions for the SHOP ("leave with the neighbour"); a gift
-- message is copy for the CUSTOMER'S RECIPIENT, and the two end up in different
-- places — one on a picking screen, the other handwritten on a card that goes
-- in the box. Merged, packers would have to guess which half of a free-text
-- field to copy out.

ALTER TABLE "Order" ADD COLUMN "isGift" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Order" ADD COLUMN "giftMessage" TEXT;

-- Gift orders are picked differently and are worth finding as a group when a
-- festival run is being packed. Partial, because they are a small minority of
-- rows and an index over every non-gift order would be mostly dead weight.
CREATE INDEX "Order_isGift_createdAt_idx" ON "Order"("createdAt" DESC) WHERE "isGift";
