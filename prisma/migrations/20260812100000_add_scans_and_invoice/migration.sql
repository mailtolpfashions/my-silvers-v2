-- Shipment scan history, and tax-invoice identity.
--
-- Hand-written, like every migration here: `prisma migrate dev` would drop the
-- generated "searchVector" column on Product.

-- ── Tracking ────────────────────────────────────────────────────────────────
-- The courier's scan trail, as Shiprocket sends it. JSONB rather than a child
-- table because it is written whole by the webhook and read whole with the
-- order — there is no query that wants one scan, and a ShipmentScan table would
-- add a join to every order page to store data nothing filters on.
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "shipmentScans" JSONB;

-- ── Tax invoice ─────────────────────────────────────────────────────────────
-- Issued lazily, the first time an invoice is rendered, NOT at order creation:
-- GST numbering must be a consecutive series of documents that actually exist,
-- and an order abandoned before payment must not burn a number.
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "invoiceNumber" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "invoicedAt" TIMESTAMP(3);

-- The rate is SNAPSHOT on the order rather than read from config at render
-- time. If the GST rate on jewellery ever changes, every historical invoice
-- would otherwise silently reprint with the new split and stop matching what
-- was actually filed.
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "gstRatePercent" DECIMAL(5,2);

CREATE UNIQUE INDEX IF NOT EXISTS "Order_invoiceNumber_key" ON "Order"("invoiceNumber");

-- Mirrors order_number_seq. Separate sequence because the two series are
-- independent: not every order becomes an invoice (unpaid, cancelled), and the
-- invoice series must stay consecutive across whatever the order series does.
CREATE SEQUENCE IF NOT EXISTS "invoice_number_seq" START 1;
