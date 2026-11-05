-- BigChix: one switch, set by a superuser on the desk, that puts cooked dishes
-- on sale on bigchix.cleva.rw. Off until kitchens, riders and a real-money
-- test order are ready. Run after 101_shop_riders.sql.
--
-- Undo, by hand after a backup: remove the dishes_on_sale column.

ALTER TABLE shop_settings
  ADD COLUMN IF NOT EXISTS dishes_on_sale BOOLEAN NOT NULL DEFAULT false;
