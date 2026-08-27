-- Gift wrap as a paid add-on: what was charged for it, snapshotted on the order.
--
-- Hand-written, like every migration here: `prisma migrate dev` would drop the
-- generated "searchVector" column on Product. See the note in schema.prisma.
--
-- ⚠️  A SNAPSHOT, not a lookup. The price lives in StoreSetting and an admin can
-- change it whenever they like; an order must keep saying what it actually
-- charged. Without this column, raising the price from ₹50 to ₹75 would
-- retroactively rewrite every past invoice — and an invoice that disagrees with
-- what the customer paid is a GST document that is wrong.
--
-- Same reasoning as `shippingCharge` beside it, and as `gstRatePercent`.
--
-- DEFAULT 0 rather than NULL: every existing order charged nothing for gift
-- wrap, which is a fact about it and not missing information. Totals that add
-- this column therefore need no null handling.

ALTER TABLE "Order" ADD COLUMN "giftWrapCharge" DECIMAL(10,2) NOT NULL DEFAULT 0;
