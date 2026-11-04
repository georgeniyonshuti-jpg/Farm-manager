-- Butcher shop: item photos, stored in the farm database so they need no
-- outside service and are in every deploy backup. The desk resizes each photo
-- in the browser before upload, so rows stay small (a few hundred KB).
-- Run after 095_butcher_shop.sql. shop_products.photo_url points at
-- /api/market/shop/photos/<id>.
--
-- Undo, by hand after a backup: remove the shop_product_photos table.
-- server/migrate.js skips any file whose text matches its destructive pattern
-- in production, comments included. Do not spell out the undo statement here.

CREATE TABLE IF NOT EXISTS shop_product_photos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type  TEXT NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
  bytes         BYTEA NOT NULL,
  size_bytes    INTEGER NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 2097152),
  uploaded_by   UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
