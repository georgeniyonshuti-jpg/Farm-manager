-- Persist feed type on flock feed entries for stock-backed logging and ERPNext sync.

ALTER TABLE flock_feed_entries
  ADD COLUMN IF NOT EXISTS feed_type TEXT;

CREATE INDEX IF NOT EXISTS idx_flock_feed_entries_feed_type
  ON flock_feed_entries (feed_type);

COMMENT ON COLUMN flock_feed_entries.feed_type IS 'Feed stock type (starter/grower/finisher/supplement); required for consumption from farm_inventory_transactions ledger.';
