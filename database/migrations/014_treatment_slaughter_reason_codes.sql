ALTER TABLE IF EXISTS flock_treatments
  ADD COLUMN IF NOT EXISTS reason_code TEXT NOT NULL DEFAULT 'other';

ALTER TABLE IF EXISTS flock_slaughter_events
  ADD COLUMN IF NOT EXISTS reason_code TEXT NOT NULL DEFAULT 'planned_market';

CREATE INDEX IF NOT EXISTS idx_flock_treatments_reason_code ON flock_treatments (reason_code);
CREATE INDEX IF NOT EXISTS idx_flock_slaughter_reason_code ON flock_slaughter_events (reason_code);
