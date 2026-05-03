CREATE TABLE IF NOT EXISTS flock_treatments (
  id                      TEXT PRIMARY KEY,
  flock_id                TEXT NOT NULL,
  at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  disease_or_reason       TEXT NOT NULL,
  medicine_name           TEXT NOT NULL,
  dose                    NUMERIC(14, 4) NOT NULL CHECK (dose > 0),
  dose_unit               TEXT NOT NULL,
  route                   TEXT NOT NULL,
  duration_days           INTEGER NOT NULL DEFAULT 1 CHECK (duration_days > 0),
  withdrawal_days         INTEGER NOT NULL DEFAULT 0 CHECK (withdrawal_days >= 0),
  notes                   TEXT NOT NULL DEFAULT '',
  administered_by_user_id TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_flock_treatments_flock_at ON flock_treatments (flock_id, at DESC);

CREATE TABLE IF NOT EXISTS flock_slaughter_events (
  id                      TEXT PRIMARY KEY,
  flock_id                TEXT NOT NULL,
  at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  birds_slaughtered       INTEGER NOT NULL CHECK (birds_slaughtered > 0),
  avg_live_weight_kg      NUMERIC(12, 3) NOT NULL CHECK (avg_live_weight_kg > 0),
  avg_carcass_weight_kg   NUMERIC(12, 3),
  notes                   TEXT NOT NULL DEFAULT '',
  entered_by_user_id      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_flock_slaughter_flock_at ON flock_slaughter_events (flock_id, at DESC);
