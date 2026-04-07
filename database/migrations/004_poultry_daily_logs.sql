-- Daily operational logs; laborer-authored with sanity-check / vet approval workflow

CREATE TABLE poultry_daily_logs (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flock_id                UUID NOT NULL REFERENCES poultry_flocks (id) ON DELETE CASCADE,
  laborer_id              TEXT NOT NULL REFERENCES app_users (id) ON DELETE RESTRICT,
  log_date                DATE NOT NULL,
  mortality               INTEGER NOT NULL DEFAULT 0 CHECK (mortality >= 0),
  feed_intake_kg          NUMERIC(12, 3) NOT NULL DEFAULT 0 CHECK (feed_intake_kg >= 0),
  water_liters            NUMERIC(12, 3) NOT NULL DEFAULT 0 CHECK (water_liters >= 0),
  temp_min_c              NUMERIC(5, 2),
  temp_max_c              NUMERIC(5, 2),
  avg_weight_sample_kg    NUMERIC(10, 3),
  notes                   TEXT,
  validation_status       poultry_daily_log_validation_status NOT NULL DEFAULT 'draft',
  mortality_pct_of_initial NUMERIC(8, 4),
  flagged_high_mortality  BOOLEAN NOT NULL DEFAULT false,
  submitted_at            TIMESTAMPTZ,
  reviewed_by             TEXT REFERENCES app_users (id) ON DELETE SET NULL,
  reviewed_at             TIMESTAMPTZ,
  review_notes            TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (flock_id, log_date)
);

CREATE INDEX idx_poultry_daily_logs_flock ON poultry_daily_logs (flock_id);
CREATE INDEX idx_poultry_daily_logs_laborer ON poultry_daily_logs (laborer_id);
CREATE INDEX idx_poultry_daily_logs_status ON poultry_daily_logs (validation_status);
CREATE INDEX idx_poultry_daily_logs_flag ON poultry_daily_logs (flagged_high_mortality)
  WHERE flagged_high_mortality = true;

COMMENT ON COLUMN poultry_daily_logs.mortality_pct_of_initial IS 'Computed: mortality / flock.initial_count * 100; used for 0.5% red alert.';
COMMENT ON COLUMN poultry_daily_logs.flagged_high_mortality IS 'True when single-day mortality rules require vet_manager approval before P&L use.';
