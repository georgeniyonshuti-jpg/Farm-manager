-- Butcher shop: each item belongs to one shelf on market.cleva.rw, so the
-- shop can show category chips and ads can link straight to one category.
-- Run after 095_butcher_shop.sql. Existing items become whole chicken.
--
-- Undo, by hand after a backup: remove the category column from shop_products.

ALTER TABLE shop_products
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'whole';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'shop_products_category_check'
  ) THEN
    ALTER TABLE shop_products
      ADD CONSTRAINT shop_products_category_check
      CHECK (category IN ('whole', 'cuts', 'prepared', 'cooked'));
  END IF;
END $$;
