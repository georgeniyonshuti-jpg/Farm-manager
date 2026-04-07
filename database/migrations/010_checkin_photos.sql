-- FIX: store primary photo URL (and optional gallery) for each round check-in
CREATE TABLE IF NOT EXISTS check_ins (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flock_id            UUID NOT NULL,
  laborer_id          UUID NOT NULL,
  at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  photo_url           TEXT,
  photo_urls          JSONB,
  feed_kg             NUMERIC(12, 3),
  water_l             NUMERIC(12, 3),
  notes               TEXT,
  mortality_at_checkin INTEGER NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_check_ins_flock_id_at ON check_ins (flock_id, at DESC);

COMMENT ON TABLE check_ins IS 'Round check-ins; photo_url is primary image for reports.';
COMMENT ON COLUMN check_ins.photo_url IS 'Primary image URL or data-URL reference for this check-in.';
