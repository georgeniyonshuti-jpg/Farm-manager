-- Field payroll: flock linkage + allow all app log types (feed_entry, mortality_event, etc.)
ALTER TABLE payroll_impact
  ADD COLUMN IF NOT EXISTS flock_id UUID REFERENCES poultry_flocks (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_payroll_impact_flock_period
  ON payroll_impact (flock_id, period_start, period_end);

ALTER TABLE payroll_impact DROP CONSTRAINT IF EXISTS payroll_impact_log_type_check;

COMMENT ON COLUMN payroll_impact.flock_id IS 'Flock for auto field credits; null for manual cross-flock adjustments.';
