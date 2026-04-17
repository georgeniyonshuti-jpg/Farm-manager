-- Feed Inventory Stock Rework
-- Allow farm-wide (no flock) inventory transactions, add feed_type column,
-- and add feed_entry_id linkage for idempotent auto-deduction on approval.

-- 1. Allow NULL flock_id (farm-wide purchases and auto-deductions don't need a flock)
ALTER TABLE farm_inventory_transactions
  ALTER COLUMN flock_id DROP NOT NULL;

-- 2. Add feed type column for per-type stock aggregation
ALTER TABLE farm_inventory_transactions
  ADD COLUMN IF NOT EXISTS feed_type TEXT;

-- 3. Add link to originating feed log entry (used as idempotency key for auto-consumption)
ALTER TABLE farm_inventory_transactions
  ADD COLUMN IF NOT EXISTS feed_entry_id UUID REFERENCES flock_feed_entries (id) ON DELETE SET NULL;

-- 4. Index for fast feed-type summary queries
CREATE INDEX IF NOT EXISTS idx_farm_inventory_transactions_feed_type
  ON farm_inventory_transactions (feed_type, recorded_at DESC);

-- 5. Unique partial index: exactly one auto-consumption row per approved feed entry
CREATE UNIQUE INDEX IF NOT EXISTS idx_farm_inventory_transactions_feed_entry_unique
  ON farm_inventory_transactions (feed_entry_id)
  WHERE feed_entry_id IS NOT NULL;
