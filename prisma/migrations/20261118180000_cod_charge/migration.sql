-- Cash-on-delivery charge (Nov 2026): a snapshot per order, like the
-- shipping and gift wrap charges. Existing orders were never charged one.

ALTER TABLE "Order" ADD COLUMN "codCharge" DECIMAL(10,2) NOT NULL DEFAULT 0;
