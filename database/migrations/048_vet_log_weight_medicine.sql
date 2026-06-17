-- Vet log weight sampling + medicine links for IAS 41 / ERPNext sync.

ALTER TABLE farm_vet_logs
  ADD COLUMN IF NOT EXISTS weigh_in_id UUID REFERENCES weigh_ins (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sample_size INTEGER CHECK (sample_size IS NULL OR sample_size > 0),
  ADD COLUMN IF NOT EXISTS avg_weight_kg NUMERIC CHECK (avg_weight_kg IS NULL OR avg_weight_kg > 0),
  ADD COLUMN IF NOT EXISTS cv_pct NUMERIC,
  ADD COLUMN IF NOT EXISTS underweight_pct NUMERIC,
  ADD COLUMN IF NOT EXISTS total_feed_used_kg NUMERIC CHECK (total_feed_used_kg IS NULL OR total_feed_used_kg >= 0);

CREATE INDEX IF NOT EXISTS idx_farm_vet_logs_weigh_in ON farm_vet_logs (weigh_in_id);

ALTER TABLE weigh_ins
  ADD COLUMN IF NOT EXISTS vet_log_id UUID REFERENCES farm_vet_logs (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'standalone',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE weigh_ins
  DROP CONSTRAINT IF EXISTS weigh_ins_source_check;
ALTER TABLE weigh_ins
  ADD CONSTRAINT weigh_ins_source_check CHECK (source IN ('standalone', 'vet_log'));

CREATE INDEX IF NOT EXISTS idx_weigh_ins_vet_log ON weigh_ins (vet_log_id);

ALTER TABLE flock_treatments
  ADD COLUMN IF NOT EXISTS vet_log_id UUID REFERENCES farm_vet_logs (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_flock_treatments_vet_log ON flock_treatments (vet_log_id);

COMMENT ON COLUMN farm_vet_logs.weigh_in_id IS 'Linked weigh-in sample created from this vet visit.';
COMMENT ON COLUMN weigh_ins.vet_log_id IS 'Parent vet log when source=vet_log.';
COMMENT ON COLUMN flock_treatments.vet_log_id IS 'Vet log that recorded this treatment during a visit.';
