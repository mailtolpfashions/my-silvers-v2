-- Parcels coming back to the shop (Nov 2026). A courier RTO or courier-side
-- cancellation moved the order to returned/cancelled but never put its stock
-- back. These two dates track the parcel until staff confirm it is in hand.
-- Nullable, no default — metadata-only, no table rewrite.

ALTER TABLE "Order" ADD COLUMN "comingBackAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN "receivedBackAt" TIMESTAMP(3);

-- Orders the courier already sent back before this existed: shipped, now
-- returned or cancelled, and not through an approved return (which restores
-- stock itself and stamps returnResolvedAt). Only where stock was taken.
UPDATE "Order"
SET "comingBackAt" = "updatedAt"
WHERE "orderStatus" IN ('returned', 'cancelled')
  AND "shipmentCreatedAt" IS NOT NULL
  AND "returnResolvedAt" IS NULL
  AND ("paymentMethod" = 'cod' OR "paymentStatus" IN ('paid', 'refunded'));
