-- Whether a costed product's price was typed by the owner (Nov 2026).
-- Recalculate re-prices only the automatic ones.

ALTER TABLE "ProductCosting" ADD COLUMN "manualPrice" BOOLEAN NOT NULL DEFAULT false;
