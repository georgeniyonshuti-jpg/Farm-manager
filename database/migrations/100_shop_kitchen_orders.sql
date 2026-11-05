-- BigChix dish orders. An order is either fresh chicken (to a butcher) or
-- BigChix dishes (to a kitchen), delivered or collected at the kitchen.
-- butcher_id holds the assigned partner either way.
-- Run after 099_shop_kitchens.sql. Existing orders become fresh deliveries.
--
-- Undo, by hand after a backup: remove the columns added below.

ALTER TABLE shop_orders
  ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'fresh';
ALTER TABLE shop_orders
  ADD COLUMN IF NOT EXISTS fulfilment TEXT NOT NULL DEFAULT 'delivery';
-- Kitchens that declined this order or let it wait too long; it is not offered to them again.
ALTER TABLE shop_orders
  ADD COLUMN IF NOT EXISTS declined_partner_ids UUID[] NOT NULL DEFAULT '{}';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shop_orders_channel_check') THEN
    ALTER TABLE shop_orders
      ADD CONSTRAINT shop_orders_channel_check CHECK (channel IN ('fresh', 'kitchen'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shop_orders_fulfilment_check') THEN
    ALTER TABLE shop_orders
      ADD CONSTRAINT shop_orders_fulfilment_check CHECK (fulfilment IN ('delivery', 'pickup'));
  END IF;
  -- Pickup is for kitchen orders only; butchers always deliver.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shop_orders_pickup_kitchen_check') THEN
    ALTER TABLE shop_orders
      ADD CONSTRAINT shop_orders_pickup_kitchen_check CHECK (fulfilment = 'delivery' OR channel = 'kitchen');
  END IF;
END $$;

-- The kitchen's fixed fee for one of this dish, set when a kitchen is assigned.
ALTER TABLE shop_order_lines
  ADD COLUMN IF NOT EXISTS partner_fee_rwf INTEGER CHECK (partner_fee_rwf IS NULL OR partner_fee_rwf >= 0);

-- Kitchens get less time than butchers to accept: hot food cannot wait.
ALTER TABLE shop_settings
  ADD COLUMN IF NOT EXISTS kitchen_accept_within_minutes INTEGER NOT NULL DEFAULT 5
    CHECK (kitchen_accept_within_minutes > 0);

CREATE INDEX IF NOT EXISTS shop_orders_kitchen_open_idx
  ON shop_orders (butcher_id)
  WHERE channel = 'kitchen' AND status IN ('paid', 'accepted', 'ready', 'out_for_delivery');
