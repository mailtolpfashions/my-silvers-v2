-- Courier partners (Nov 2026): NimbusPost alongside Shiprocket. Hand-written,
-- like every migration here. New columns are nullable with no default —
-- metadata-only in Postgres, no table rewrite.

CREATE TYPE "CourierProvider" AS ENUM ('shiprocket', 'nimbuspost');

ALTER TABLE "Order" ADD COLUMN "courierProvider" "CourierProvider";
ALTER TABLE "Order" ADD COLUMN "nimbuspostOrderId" TEXT;
ALTER TABLE "Order" ADD COLUMN "shippingCost" DECIMAL(10,2);

-- Everything booked so far went through Shiprocket.
UPDATE "Order"
SET "courierProvider" = 'shiprocket'
WHERE "shiprocketOrderId" IS NOT NULL OR "trackingNumber" IS NOT NULL;
