-- Persist flock scheduling settings and inventory ledger rows.
-- This prevents deploy/restart data loss when server memory resets.

ALTER TABLE poultry_flocks
  ADD COLUMN IF NOT EXISTS checkin_bands JSONB,
  ADD COLUMN IF NOT EXISTS photos_required_per_round INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS target_slaughter_day_min INTEGER NOT NULL DEFAULT 45,
  ADD COLUMN IF NOT EXISTS target_slaughter_day_max INTEGER NOT NULL DEFAULT 50;

ALTER TABLE poultry_flocks
  DROP CONSTRAINT IF EXISTS poultry_flocks_photos_required_per_round_check;
ALTER TABLE poultry_flocks
  ADD CONSTRAINT poultry_flocks_photos_required_per_round_check
    CHECK (photos_required_per_round BETWEEN 1 AND 5);

ALTER TABLE poultry_flocks
  DROP CONSTRAINT IF EXISTS poultry_flocks_target_slaughter_day_min_check;
ALTER TABLE poultry_flocks
  ADD CONSTRAINT poultry_flocks_target_slaughter_day_min_check
    CHECK (target_slaughter_day_min >= 1);

ALTER TABLE poultry_flocks
  DROP CONSTRAINT IF EXISTS poultry_flocks_target_slaughter_day_max_check;
ALTER TABLE poultry_flocks
  ADD CONSTRAINT poultry_flocks_target_slaughter_day_max_check
    CHECK (target_slaughter_day_max >= target_slaughter_day_min);

COMMENT ON COLUMN poultry_flocks.checkin_bands IS 'Optional per-flock check-in interval bands [{untilDay, intervalHours}].';
COMMENT ON COLUMN poultry_flocks.photos_required_per_round IS 'Required check-in photos per round (1-5).';
COMMENT ON COLUMN poultry_flocks.target_slaughter_day_min IS 'Recommended lower bound for slaughter day window.';
COMMENT ON COLUMN poultry_flocks.target_slaughter_day_max IS 'Recommended upper bound for slaughter day window.';

CREATE TABLE IF NOT EXISTS farm_inventory_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flock_id UUID NOT NULL REFERENCES poultry_flocks (id) ON DELETE CASCADE,
  transaction_type TEXT NOT NULL
    CHECK (transaction_type IN ('procurement_receipt', 'feed_consumption', 'adjustment')),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  quantity_kg NUMERIC(14, 3) NOT NULL CHECK (quantity_kg > 0),
  delta_kg NUMERIC(14, 3) NOT NULL CHECK (delta_kg <> 0),
  unit_cost_rwf_per_kg NUMERIC(14, 2) CHECK (unit_cost_rwf_per_kg IS NULL OR unit_cost_rwf_per_kg >= 0),
  reason TEXT NOT NULL DEFAULT '',
  reference TEXT NOT NULL DEFAULT '',
  actor_user_id UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  approved_by_user_id UUID REFERENCES users (id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_farm_inventory_transactions_flock_time
  ON farm_inventory_transactions (flock_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_farm_inventory_transactions_type_time
  ON farm_inventory_transactions (transaction_type, recorded_at DESC);
