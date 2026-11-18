-- When the parcel reached the customer (Nov 2026). Starts the return window
-- (store setting returnRequestHours). Nullable, no default — metadata-only.

ALTER TABLE "Order" ADD COLUMN "deliveredAt" TIMESTAMP(3);

-- Orders delivered before this existed: the last time the order changed is the
-- closest thing on record. It can only be LATER than the real delivery, so the
-- error runs in the customer's favour — a window that closes a little late,
-- never one that closed before it opened.
UPDATE "Order"
SET "deliveredAt" = "updatedAt"
WHERE "orderStatus" IN ('delivered', 'return_requested', 'returned', 'refunded')
  AND "comingBackAt" IS NULL;
