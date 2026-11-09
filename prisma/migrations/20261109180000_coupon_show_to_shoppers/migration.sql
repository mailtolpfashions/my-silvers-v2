-- "Available offers": whether a coupon is listed to shoppers in the cart and
-- at checkout. Off by default, so every existing coupon stays type-to-use
-- until the shop chooses to list it.
--
-- Hand-written, like every migration here — see 20261109160000_add_coupons.
-- A constant default is metadata-only in Postgres 11+: no table rewrite.

ALTER TABLE "Coupon" ADD COLUMN "showToShoppers" BOOLEAN NOT NULL DEFAULT false;
