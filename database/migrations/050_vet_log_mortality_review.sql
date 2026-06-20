-- Vet log mortality review: vet confirms deaths since last visit and live bird count.

ALTER TABLE farm_vet_logs
  ADD COLUMN IF NOT EXISTS previous_vet_log_id UUID REFERENCES farm_vet_logs (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS mortality_logged_since_last_visit INTEGER,
  ADD COLUMN IF NOT EXISTS mortality_confirmed_since_last_visit INTEGER,
  ADD COLUMN IF NOT EXISTS confirmed_live_count INTEGER;

CREATE INDEX IF NOT EXISTS idx_farm_vet_logs_previous
  ON farm_vet_logs (previous_vet_log_id);

COMMENT ON COLUMN farm_vet_logs.mortality_logged_since_last_visit IS 'Sum of approved mortality events since previous approved vet log at save time.';
COMMENT ON COLUMN farm_vet_logs.mortality_confirmed_since_last_visit IS 'Vet-confirmed death count since previous visit (may differ after corrections).';
COMMENT ON COLUMN farm_vet_logs.confirmed_live_count IS 'Computed live birds at visit (initial - mortality - slaughter) — ERPNext snapshot, not user input.';
