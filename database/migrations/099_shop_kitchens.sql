-- BigChix kitchens. A kitchen is a partner like a butcher: it shares the
-- partner record (name, phone, payout number, zones, status) and is marked
-- with kind = 'kitchen'. Kitchen-only settings and the dishes each kitchen
-- makes, with the fixed fee it is paid per dish, live in their own tables.
-- Run after 098_shop_product_category.sql. Existing partners become butchers.
--
-- Undo, by hand after a backup: remove the two shop_kitchen_* tables and the
-- kind column from shop_butchers.

ALTER TABLE shop_butchers
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'butcher';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'shop_butchers_kind_check'
  ) THEN
    ALTER TABLE shop_butchers
      ADD CONSTRAINT shop_butchers_kind_check CHECK (kind IN ('butcher', 'kitchen'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS shop_kitchen_settings (
  partner_id         UUID PRIMARY KEY REFERENCES shop_butchers(id) ON DELETE CASCADE,
  -- Per weekday: {"mon": {"open": "11:00", "close": "21:00"}, "tue": null, ...}; null or missing = closed.
  hours              JSONB NOT NULL DEFAULT '{}'::jsonb,
  prep_minutes       INTEGER NOT NULL DEFAULT 25 CHECK (prep_minutes BETWEEN 5 AND 180),
  max_open_orders    INTEGER NOT NULL DEFAULT 10 CHECK (max_open_orders BETWEEN 1 AND 200),
  taking_orders      BOOLEAN NOT NULL DEFAULT false,
  pickup_enabled     BOOLEAN NOT NULL DEFAULT false,
  pickup_address     TEXT NOT NULL DEFAULT '',
  pickup_directions  TEXT NOT NULL DEFAULT '',
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS shop_kitchen_dishes (
  partner_id   UUID NOT NULL REFERENCES shop_butchers(id) ON DELETE CASCADE,
  product_id   UUID NOT NULL REFERENCES shop_products(id) ON DELETE CASCADE,
  -- What Cleva pays the kitchen for one of this dish. The customer price stays on shop_products.
  fee_rwf      INTEGER NOT NULL CHECK (fee_rwf >= 0),
  -- Set to a Kigali date when the kitchen marks the dish sold out for that day.
  sold_out_on  DATE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (partner_id, product_id)
);

CREATE INDEX IF NOT EXISTS shop_kitchen_dishes_product_idx ON shop_kitchen_dishes (product_id);
