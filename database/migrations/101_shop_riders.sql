-- BigChix riders. Cleva books a rider for each delivered dish order and pays
-- the agreed fare by MoMo. Riders are a saved list on the desk; each order
-- keeps who carried it and the fare, and the payout is its own settlement side.
-- Run after 100_shop_kitchen_orders.sql.
--
-- Undo, by hand after a backup: remove the rider columns from shop_orders,
-- the shop_riders table, and 'rider_out' from the settlement sides.

CREATE TABLE IF NOT EXISTS shop_riders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  phone           TEXT NOT NULL,
  momo_phone      TEXT,
  momo_name       TEXT NOT NULL DEFAULT '',
  plate           TEXT NOT NULL DEFAULT '',
  active          BOOLEAN NOT NULL DEFAULT true,
  notes           TEXT NOT NULL DEFAULT '',
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE shop_orders
  ADD COLUMN IF NOT EXISTS rider_id UUID REFERENCES shop_riders(id) ON DELETE SET NULL;
ALTER TABLE shop_orders
  ADD COLUMN IF NOT EXISTS rider_fare_rwf INTEGER CHECK (rider_fare_rwf IS NULL OR rider_fare_rwf >= 0);
ALTER TABLE shop_orders
  ADD COLUMN IF NOT EXISTS rider_booked_at TIMESTAMPTZ;

-- A rider payout is its own settlement side, recorded at most once per order.
ALTER TABLE shop_settlements DROP CONSTRAINT IF EXISTS shop_settlements_side_check;
ALTER TABLE shop_settlements
  ADD CONSTRAINT shop_settlements_side_check
  CHECK (side IN ('customer_in', 'butcher_out', 'delivery_out', 'rider_out', 'refund'));

CREATE UNIQUE INDEX IF NOT EXISTS shop_settlements_rider_out_once
  ON shop_settlements (order_id)
  WHERE side = 'rider_out' AND status IN ('pending', 'paid');

CREATE INDEX IF NOT EXISTS shop_orders_rider_idx ON shop_orders (rider_id) WHERE rider_id IS NOT NULL;
