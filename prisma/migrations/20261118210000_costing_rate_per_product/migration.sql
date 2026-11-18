-- The silver rate and making charge are always the product's own (Nov 2026):
-- a shop-wide default would re-cost old stock whenever the rate moved.
-- The table is new and empty in production; any row without both is dropped.

DELETE FROM "ProductCosting" WHERE "silverRatePerGram" IS NULL OR "makingChargePerGram" IS NULL;
ALTER TABLE "ProductCosting" ALTER COLUMN "silverRatePerGram" SET NOT NULL;
ALTER TABLE "ProductCosting" ALTER COLUMN "makingChargePerGram" SET NOT NULL;
