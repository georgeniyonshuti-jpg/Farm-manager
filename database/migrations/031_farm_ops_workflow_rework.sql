-- Farm Ops Workflow Rework: check-in booleans, feed/mortality review fields,
-- vet logs table, payroll log_type expansion, and configurable commission rates.

----------------------------------------------------------------------
-- 1. check_ins: boolean feed/water + mortality-reported flag
----------------------------------------------------------------------
ALTER TABLE check_ins
  ADD COLUMN IF NOT EXISTS feed_available               BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS water_available              BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS mortality_reported_in_mortality_log BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN check_ins.feed_available IS 'Laborer tick: feed is available at this round.';
COMMENT ON COLUMN check_ins.water_available IS 'Laborer tick: water is available at this round.';
COMMENT ON COLUMN check_ins.mortality_reported_in_mortality_log IS 'True when mortality entered here was also filed in the mortality log.';

----------------------------------------------------------------------
-- 2. flock_feed_entries: approval workflow
----------------------------------------------------------------------
ALTER TABLE flock_feed_entries
  ADD COLUMN IF NOT EXISTS submission_status  TEXT NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS reviewed_by_user_id UUID REFERENCES users (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS review_notes        TEXT;

ALTER TABLE flock_feed_entries
  DROP CONSTRAINT IF EXISTS flock_feed_entries_submission_status_check;
ALTER TABLE flock_feed_entries
  ADD CONSTRAINT flock_feed_entries_submission_status_check
    CHECK (submission_status IN ('pending_review', 'approved', 'rejected'));

CREATE INDEX IF NOT EXISTS idx_flock_feed_entries_status_recorded
  ON flock_feed_entries (submission_status, recorded_at DESC);

----------------------------------------------------------------------
-- 3. flock_mortality_events: approval workflow + live-count flag
----------------------------------------------------------------------
ALTER TABLE flock_mortality_events
  ADD COLUMN IF NOT EXISTS submission_status   TEXT NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS reviewed_by_user_id UUID REFERENCES users (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS review_notes         TEXT,
  ADD COLUMN IF NOT EXISTS affects_live_count   BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE flock_mortality_events
  DROP CONSTRAINT IF EXISTS flock_mortality_events_submission_status_check;
ALTER TABLE flock_mortality_events
  ADD CONSTRAINT flock_mortality_events_submission_status_check
    CHECK (submission_status IN ('pending_review', 'approved', 'rejected'));

CREATE INDEX IF NOT EXISTS idx_flock_mortality_events_status_at
  ON flock_mortality_events (submission_status, at DESC);

COMMENT ON COLUMN flock_mortality_events.affects_live_count IS 'False for round-checkin-entered mortality that was NOT linked to a mortality log.';

----------------------------------------------------------------------
-- 4. farm_vet_logs (replaces poultry_daily_logs for clinical use)
----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS farm_vet_logs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flock_id            UUID NOT NULL REFERENCES poultry_flocks (id) ON DELETE CASCADE,
  author_user_id      UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  log_date            DATE NOT NULL,
  observations        TEXT,
  actions_taken       TEXT,
  recommendations     TEXT,
  submission_status   TEXT NOT NULL DEFAULT 'approved'
                      CHECK (submission_status IN ('pending_review', 'approved', 'rejected')),
  reviewed_by_user_id UUID REFERENCES users (id) ON DELETE SET NULL,
  reviewed_at         TIMESTAMPTZ,
  review_notes        TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (flock_id, log_date, author_user_id)
);

CREATE INDEX IF NOT EXISTS idx_farm_vet_logs_flock_date
  ON farm_vet_logs (flock_id, log_date DESC);
CREATE INDEX IF NOT EXISTS idx_farm_vet_logs_status
  ON farm_vet_logs (submission_status, created_at DESC);

COMMENT ON TABLE farm_vet_logs IS 'Clinical vet observations per flock/day. Replaces poultry_daily_logs for vet+ roles.';

----------------------------------------------------------------------
-- 5. payroll_impact: widen log_type to cover new entry types
----------------------------------------------------------------------
-- The constraint was already dropped by migration 027; re-add wider version.
ALTER TABLE payroll_impact DROP CONSTRAINT IF EXISTS payroll_impact_log_type_check;

----------------------------------------------------------------------
-- 6. app_settings seed: configurable check-in commission rates
----------------------------------------------------------------------
INSERT INTO app_settings (setting_key, setting_value)
VALUES
  ('checkin_commission_on_time_rwf', '500'),
  ('checkin_deduction_late_rwf', '300'),
  ('checkin_deduction_missed_rwf', '500')
ON CONFLICT (setting_key) DO NOTHING;
