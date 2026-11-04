-- Butcher shop: an order is paid out to its butcher at most once, and refunded
-- at most once. Failed or cancelled rows do not count, so a payout can be redone.
-- Run after 095_butcher_shop.sql.
--
-- Undo:
--   DROP INDEX IF EXISTS shop_settlements_butcher_out_once;
--   DROP INDEX IF EXISTS shop_settlements_delivery_out_once;
--   DROP INDEX IF EXISTS shop_settlements_refund_once;

CREATE UNIQUE INDEX IF NOT EXISTS shop_settlements_butcher_out_once
  ON shop_settlements (order_id)
  WHERE side = 'butcher_out' AND status IN ('pending', 'paid');

CREATE UNIQUE INDEX IF NOT EXISTS shop_settlements_delivery_out_once
  ON shop_settlements (order_id)
  WHERE side = 'delivery_out' AND status IN ('pending', 'paid');

CREATE UNIQUE INDEX IF NOT EXISTS shop_settlements_refund_once
  ON shop_settlements (order_id)
  WHERE side = 'refund' AND status IN ('pending', 'paid');
