-- Prescriptions and biosecurity audits (veterinarian / vet_manager)

CREATE TABLE poultry_prescriptions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flock_id            UUID NOT NULL REFERENCES poultry_flocks (id) ON DELETE CASCADE,
  veterinarian_id     UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  prescribed_date     DATE NOT NULL,
  product_name        TEXT NOT NULL,
  dosage              TEXT,
  duration_days       INTEGER,
  withdrawal_days     INTEGER NOT NULL DEFAULT 0 CHECK (withdrawal_days >= 0),
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_poultry_rx_flock ON poultry_prescriptions (flock_id);

CREATE TABLE poultry_biosecurity_audits (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flock_id            UUID NOT NULL REFERENCES poultry_flocks (id) ON DELETE CASCADE,
  auditor_id          UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  audit_date          DATE NOT NULL,
  score               NUMERIC(5, 2),
  passed              BOOLEAN,
  findings            TEXT,
  corrective_actions  TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_poultry_bio_flock ON poultry_biosecurity_audits (flock_id);
