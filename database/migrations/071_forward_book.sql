-- Forward book: any-age flocks, scout weigh-in, visit fee.
-- Shop stays this-week confirmed offers only.

ALTER TABLE pipeline_lots
  ADD COLUMN IF NOT EXISTS placement_date DATE,
  ADD COLUMN IF NOT EXISTS scout_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS scout_confirmed_by UUID REFERENCES users (id) ON DELETE SET NULL;

COMMENT ON COLUMN pipeline_lots.placement_date IS
  'Chicks-in date. Selling week is suggested from this + grow-out days.';
COMMENT ON COLUMN pipeline_lots.scout_confirmed_at IS
  'Set when a scout weigh-in (or Cleva-run recent weigh) confirms count and kg.';

CREATE INDEX IF NOT EXISTS idx_pipeline_lots_scout_confirmed
  ON pipeline_lots (scout_confirmed_at)
  WHERE scout_confirmed_at IS NOT NULL AND status IN ('open', 'partial');

CREATE INDEX IF NOT EXISTS idx_pipeline_lots_visit_due
  ON pipeline_lots (ready_from)
  WHERE scout_confirmed_at IS NULL AND status IN ('draft', 'open', 'partial');

ALTER TABLE farm_visits
  ALTER COLUMN farm_profile_id DROP NOT NULL;

ALTER TABLE farm_visits
  ADD COLUMN IF NOT EXISTS birds INTEGER,
  ADD COLUMN IF NOT EXISTS avg_weight_kg NUMERIC(10, 3),
  ADD COLUMN IF NOT EXISTS outcome TEXT
    CHECK (outcome IS NULL OR outcome IN ('ready', 'slip_week', 'problem')),
  ADD COLUMN IF NOT EXISTS fee_rwf NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS fee_status TEXT NOT NULL DEFAULT 'none'
    CHECK (fee_status IN ('none', 'accrued', 'paid', 'void'));

CREATE INDEX IF NOT EXISTS idx_farm_visits_fee_status
  ON farm_visits (fee_status)
  WHERE fee_status IN ('accrued', 'paid');

INSERT INTO app_settings (setting_key, setting_value)
VALUES ('pipeline_scout_visit_fee_rwf', '5000')
ON CONFLICT (setting_key) DO NOTHING;
